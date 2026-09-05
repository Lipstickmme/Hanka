// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal ERC-20 surface. Tokens with non-standard return values are supported by _callOptionalReturn.
interface IERC20V2 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title HankaMarketV2
/// @notice Versioned Arc escrow for general Bounties, social-proof Bounties with retention bonds, and named bilateral agreements.
/// @dev This contract settles ERC-20 balances and commitments. It does not read X, Ethos, Kaito, Aura, or airdrop data.
contract HankaMarketV2 {
    uint16 public constant BASIS_POINTS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint64 public constant ROLE_CHANGE_DELAY = 48 hours;
    uint64 public constant MAX_RETENTION_PERIOD = 90 days;
    uint64 public constant MAX_CASE_REVIEW_PERIOD = 30 days;
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant SOURCE_ATTESTATION_TYPEHASH = keccak256("SourceAttestation(address seller,bytes32 sourceIdentityHash,bytes32 metricsHash,uint64 followerCount,uint64 ethosScore,uint64 kaitoScore,uint64 kaitoAura,bool isVerifiedClaim,uint64 validUntil,uint256 nonce)");
    bytes32 private constant AGREEMENT_SETTLEMENT_TYPEHASH = keccak256("AgreementSettlement(uint256 agreementId,uint128 makerPayout,uint128 takerPayout,uint64 deadline,uint256 nonce)");
    bytes32 private constant NAME_HASH = keccak256("HANKA Market");
    bytes32 private constant VERSION_HASH = keccak256("2");
    bytes32 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    enum Role { Admin, Arbiter, Pauser, SourceAttester, Treasury }
    enum BountyKind { General, SocialProof }
    enum SocialProofType { Vouch, Slash, Follow, Repost, Comment, SpaceListener, SpaceSpeaker, SpaceContributor, HankaPoints }
    enum BountyState { None, Open, Accepted, Submitted, Paid, RetentionActive, RetentionCase, Disputed, Settled, Cancelled, Expired }
    enum AgreementState { None, Open, Funded, Disputed, Settled, Cancelled, Expired }

    struct SourceAttestation {
        address seller;
        bytes32 sourceIdentityHash;
        bytes32 metricsHash;
        uint64 followerCount;
        uint64 ethosScore;
        uint64 kaitoScore;
        uint64 kaitoAura;
        bool isVerifiedClaim;
        uint64 validUntil;
        uint256 nonce;
    }

    struct SocialOffer {
        address seller;
        bytes32 sourceIdentityHash;
        bytes32 metadataHash;
        uint32 capacity;
        uint32 reserved;
        uint64 expiresAt;
        SocialProofType proofType;
        bool isActive;
    }

    struct Bounty {
        address requester;
        address taker;
        address token;
        address feeRecipient;
        uint128 reward;
        uint128 retentionBond;
        uint64 acceptBy;
        uint64 dueAt;
        uint64 reviewBy;
        uint64 retentionPeriod;
        uint64 retentionEndsAt;
        uint64 caseReviewPeriod;
        uint64 caseResolveBy;
        uint64 minimumFollowerCount;
        uint64 minimumEthosScore;
        uint64 minimumKaitoScore;
        uint64 minimumKaitoAura;
        uint16 feeBpsSnapshot;
        SocialProofType proofType;
        BountyKind kind;
        BountyState state;
        bool caseDefaultToRequester;
        bool requireVerifiedSource;
        uint256 offerId;
        bytes32 termsHash;
        bytes32 metadataHash;
        bytes32 targetActionHash;
        bytes32 sourceIdentityHash;
        bytes32 deliveryHash;
        bytes32 evidenceHash;
    }

    struct Agreement {
        address maker;
        address taker;
        address token;
        address feeRecipient;
        uint128 collateral;
        uint64 acceptBy;
        uint64 settlementBy;
        uint16 feeBpsSnapshot;
        uint16 makerDeclinePayoutBps;
        uint16 makerTimeoutPayoutBps;
        AgreementState state;
        bytes32 termsHash;
        bytes32 metadataHash;
    }

    error Unauthorized();
    error InvalidAddress();
    error InvalidToken();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidState();
    error InvalidCommitment();
    error FeeTooHigh();
    error DeadlinePassed();
    error DeadlineNotReached();
    error ProtocolPaused();
    error TransferFailed();
    error Reentrancy();
    error NativeValueNotAccepted();
    error RoleChangeNotReady();
    error RoleChangeNotProposed();
    error SourceRestricted();
    error DuplicateSourceAction();
    error AttestationExpired();
    error AuthorizationAlreadyUsed();
    error InvalidOffer();
    error OfferUnavailable();
    error SourceRequirementsNotMet();
    error InvalidSignature();
    error InvalidPayout();
    error InvalidBps();

    mapping(Role => address) public roleHolder;
    mapping(Role => address) public pendingRoleHolder;
    mapping(Role => uint64) public pendingRoleReadyAt;
    mapping(address => bool) public allowedToken;
    mapping(address => uint256) public accruedFees;
    mapping(bytes32 => bool) public revokedSourceAttestations;
    mapping(bytes32 => bool) public usedOfferAttestations;
    mapping(bytes32 => bool) public usedSettlementAuthorizations;
    mapping(bytes32 => bool) public usedSourceAction;
    mapping(bytes32 => bool) public restrictedSourceIdentity;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => SocialOffer) public socialOffers;
    mapping(bytes32 => uint256) public activeSocialOfferFor;

    uint16 public defaultFeeBps;
    bool public paused;
    uint256 public bountyCount;
    uint256 public agreementCount;
    uint256 public socialOfferCount;
    uint256 private unlocked = 1;

    event RoleChangeProposed(Role indexed role, address indexed pendingHolder, uint64 readyAt);
    event RoleChanged(Role indexed role, address indexed previousHolder, address indexed nextHolder);
    event TokenConfigured(address indexed token, bool allowed);
    event DefaultFeeConfigured(uint16 feeBps);
    event PauseChanged(bool paused, address indexed by);
    event SourceAttestationRevoked(bytes32 indexed attestationDigest, address indexed by);
    event SocialOfferCreated(uint256 indexed id, address indexed seller, bytes32 indexed sourceIdentityHash, SocialProofType proofType, uint32 capacity, uint64 expiresAt, bytes32 metadataHash, bytes32 metricsHash);
    event SocialOfferCapacityUpdated(uint256 indexed id, uint32 capacity);
    event SocialOfferDeactivated(uint256 indexed id, address indexed by);
    event BountyCreated(uint256 indexed id, BountyKind indexed kind, address indexed requester, address token, uint256 reward, uint256 retentionBond, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, bytes32 termsHash, bytes32 metadataHash, bytes32 targetActionHash, uint256 offerId, uint16 feeBpsSnapshot, address feeRecipient);
    event BountyAccepted(uint256 indexed id, address indexed taker, bytes32 sourceIdentityHash, bytes32 metricsHash);
    event BountySubmitted(uint256 indexed id, bytes32 deliveryHash);
    event BountyPaid(uint256 indexed id, address indexed taker, uint256 payout, uint256 fee);
    event BountyDisputed(uint256 indexed id, address indexed openedBy);
    event BountyResolved(uint256 indexed id, uint256 requesterPayout, uint256 takerPayout, uint256 requesterBondPayout, uint256 takerBondPayout, uint256 fee);
    event BountyCancelled(uint256 indexed id);
    event BountyExpired(uint256 indexed id, BountyState previousState);
    event RetentionStarted(uint256 indexed id, bytes32 indexed sourceIdentityHash, uint64 retentionEndsAt);
    event RetentionCaseOpened(uint256 indexed id, bytes32 evidenceHash, uint64 resolveBy);
    event RetentionCaseResolved(uint256 indexed id, bool confirmed, uint256 requesterBondPayout, uint256 takerBondPayout);
    event RetentionBondReleased(uint256 indexed id, address indexed taker, uint256 amount);
    event SourceIdentityRestricted(bytes32 indexed sourceIdentityHash, uint256 indexed bountyId, address indexed by);
    event AgreementCreated(uint256 indexed id, address indexed maker, address indexed taker, address token, uint256 collateral, uint64 acceptBy, uint64 settlementBy, uint16 makerDeclinePayoutBps, uint16 makerTimeoutPayoutBps, bytes32 termsHash, bytes32 metadataHash, uint16 feeBpsSnapshot, address feeRecipient);
    event AgreementAccepted(uint256 indexed id, address indexed taker);
    event AgreementSettled(uint256 indexed id, uint256 makerPayout, uint256 takerPayout, uint256 fee, bool resolved);
    event AgreementDisputed(uint256 indexed id, address indexed openedBy);
    event AgreementCancelled(uint256 indexed id);
    event AgreementExpired(uint256 indexed id);
    event FeesWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    modifier onlyAdmin() {
        if (msg.sender != roleHolder[Role.Admin]) revert Unauthorized();
        _;
    }

    modifier onlyArbiter() {
        if (msg.sender != roleHolder[Role.Arbiter]) revert Unauthorized();
        _;
    }

    modifier onlyPauser() {
        if (msg.sender != roleHolder[Role.Pauser]) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ProtocolPaused();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(
        address initialAdmin,
        address initialArbiter,
        address initialPauser,
        address initialSourceAttester,
        address initialTreasury,
        address[] memory initialTokens,
        uint16 initialDefaultFeeBps
    ) {
        if (
            initialAdmin == address(0) || initialArbiter == address(0) || initialPauser == address(0)
                || initialSourceAttester == address(0) || initialTreasury == address(0)
        ) revert InvalidAddress();
        roleHolder[Role.Admin] = initialAdmin;
        roleHolder[Role.Arbiter] = initialArbiter;
        roleHolder[Role.Pauser] = initialPauser;
        roleHolder[Role.SourceAttester] = initialSourceAttester;
        roleHolder[Role.Treasury] = initialTreasury;
        _setDefaultFee(initialDefaultFeeBps);
        for (uint256 i; i < initialTokens.length; ++i) {
            if (initialTokens[i] == address(0)) revert InvalidAddress();
            allowedToken[initialTokens[i]] = true;
            emit TokenConfigured(initialTokens[i], true);
        }
    }

    receive() external payable { revert NativeValueNotAccepted(); }
    fallback() external payable { revert NativeValueNotAccepted(); }

    function domainSeparatorV4() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function hashSourceAttestation(SourceAttestation calldata attestation) external view returns (bytes32) {
        return _hashSourceAttestation(attestation);
    }

    function hashAgreementSettlement(uint256 agreementId, uint128 makerPayout, uint128 takerPayout, uint64 deadline, uint256 nonce) external view returns (bytes32) {
        return _hashAgreementSettlement(agreementId, makerPayout, takerPayout, deadline, nonce);
    }

    function proposeRole(Role role, address nextHolder) external onlyAdmin {
        if (nextHolder == address(0)) revert InvalidAddress();
        pendingRoleHolder[role] = nextHolder;
        uint64 readyAt = uint64(block.timestamp + ROLE_CHANGE_DELAY);
        pendingRoleReadyAt[role] = readyAt;
        emit RoleChangeProposed(role, nextHolder, readyAt);
    }

    function acceptRole(Role role) external {
        address nextHolder = pendingRoleHolder[role];
        if (nextHolder == address(0) || msg.sender != nextHolder) revert RoleChangeNotProposed();
        if (block.timestamp < pendingRoleReadyAt[role]) revert RoleChangeNotReady();
        address previousHolder = roleHolder[role];
        roleHolder[role] = nextHolder;
        pendingRoleHolder[role] = address(0);
        pendingRoleReadyAt[role] = 0;
        emit RoleChanged(role, previousHolder, nextHolder);
    }

    function configureToken(address token, bool allowed) external onlyAdmin {
        if (token == address(0)) revert InvalidAddress();
        allowedToken[token] = allowed;
        emit TokenConfigured(token, allowed);
    }

    function setDefaultFeeBps(uint16 nextFeeBps) external onlyAdmin {
        _setDefaultFee(nextFeeBps);
    }

    function pause() external onlyPauser {
        paused = true;
        emit PauseChanged(true, msg.sender);
    }

    function unpause() external onlyAdmin {
        paused = false;
        emit PauseChanged(false, msg.sender);
    }

    function revokeSourceAttestation(SourceAttestation calldata attestation) external {
        if (msg.sender != roleHolder[Role.SourceAttester] && msg.sender != roleHolder[Role.Admin]) revert Unauthorized();
        bytes32 digest = _hashSourceAttestation(attestation);
        revokedSourceAttestations[digest] = true;
        emit SourceAttestationRevoked(digest, msg.sender);
    }

    function createSocialOffer(
        SourceAttestation calldata attestation,
        bytes calldata signature,
        SocialProofType proofType,
        uint32 capacity,
        uint64 expiresAt,
        bytes32 metadataHash
    ) external whenNotPaused returns (uint256 id) {
        if (attestation.seller != msg.sender) revert Unauthorized();
        if (capacity == 0 || expiresAt <= block.timestamp || metadataHash == bytes32(0)) revert InvalidOffer();
        bytes32 digest = _validateSourceAttestation(attestation, signature);
        bytes32 offerKey = keccak256(abi.encode(msg.sender, attestation.sourceIdentityHash, proofType));
        if (activeSocialOfferFor[offerKey] != 0) revert InvalidOffer();
        usedOfferAttestations[keccak256(abi.encode(digest, proofType))] = true;
        id = ++socialOfferCount;
        socialOffers[id] = SocialOffer({
            seller: msg.sender,
            sourceIdentityHash: attestation.sourceIdentityHash,
            metadataHash: metadataHash,
            capacity: capacity,
            reserved: 0,
            expiresAt: expiresAt,
            proofType: proofType,
            isActive: true
        });
        activeSocialOfferFor[offerKey] = id;
        emit SocialOfferCreated(id, msg.sender, attestation.sourceIdentityHash, proofType, capacity, expiresAt, metadataHash, attestation.metricsHash);
    }

    function updateSocialOfferCapacity(uint256 id, uint32 capacity) external {
        SocialOffer storage offer = socialOffers[id];
        if (!offer.isActive || msg.sender != offer.seller || capacity < offer.reserved) revert InvalidOffer();
        offer.capacity = capacity;
        emit SocialOfferCapacityUpdated(id, capacity);
    }

    function deactivateSocialOffer(uint256 id) external {
        SocialOffer storage offer = socialOffers[id];
        if (!offer.isActive || msg.sender != offer.seller) revert InvalidOffer();
        offer.isActive = false;
        activeSocialOfferFor[keccak256(abi.encode(offer.seller, offer.sourceIdentityHash, offer.proofType))] = 0;
        emit SocialOfferDeactivated(id, msg.sender);
    }

    function createBounty(
        address token,
        uint128 reward,
        uint64 acceptBy,
        uint64 dueAt,
        uint64 reviewBy,
        bytes32 termsHash,
        bytes32 metadataHash
    ) external whenNotPaused nonReentrant returns (uint256 id) {
        _validateBountyCreate(token, reward, acceptBy, dueAt, reviewBy, termsHash, metadataHash);
        _pull(token, msg.sender, reward);
        id = ++bountyCount;
        bounties[id] = Bounty({
            requester: msg.sender,
            taker: address(0),
            token: token,
            feeRecipient: roleHolder[Role.Treasury],
            reward: reward,
            retentionBond: 0,
            acceptBy: acceptBy,
            dueAt: dueAt,
            reviewBy: reviewBy,
            retentionPeriod: 0,
            retentionEndsAt: 0,
            caseReviewPeriod: 0,
            caseResolveBy: 0,
            minimumFollowerCount: 0,
            minimumEthosScore: 0,
            minimumKaitoScore: 0,
            minimumKaitoAura: 0,
            feeBpsSnapshot: defaultFeeBps,
            proofType: SocialProofType.Vouch,
            kind: BountyKind.General,
            state: BountyState.Open,
            caseDefaultToRequester: false,
            requireVerifiedSource: false,
            offerId: 0,
            termsHash: termsHash,
            metadataHash: metadataHash,
            targetActionHash: bytes32(0),
            sourceIdentityHash: bytes32(0),
            deliveryHash: bytes32(0),
            evidenceHash: bytes32(0)
        });
        emit BountyCreated(id, BountyKind.General, msg.sender, token, reward, 0, acceptBy, dueAt, reviewBy, termsHash, metadataHash, bytes32(0), 0, defaultFeeBps, roleHolder[Role.Treasury]);
    }

    function createSocialBounty(
        address token,
        uint128 reward,
        uint128 retentionBond,
        uint64 acceptBy,
        uint64 dueAt,
        uint64 reviewBy,
        uint64 retentionPeriod,
        uint64 caseReviewPeriod,
        bool caseDefaultToRequester,
        uint64 minimumFollowerCount,
        uint64 minimumEthosScore,
        uint64 minimumKaitoScore,
        uint64 minimumKaitoAura,
        bool requireVerifiedSource,
        uint256 offerId,
        SocialProofType proofType,
        bytes32 termsHash,
        bytes32 metadataHash,
        bytes32 targetActionHash
    ) external whenNotPaused nonReentrant returns (uint256 id) {
        _validateBountyCreate(token, reward, acceptBy, dueAt, reviewBy, termsHash, metadataHash);
        if (retentionBond == 0 || retentionPeriod == 0 || retentionPeriod > MAX_RETENTION_PERIOD || caseReviewPeriod == 0 || caseReviewPeriod > MAX_CASE_REVIEW_PERIOD || targetActionHash == bytes32(0)) revert InvalidCommitment();
        if (offerId != 0) {
            SocialOffer storage offer = socialOffers[offerId];
            if (!offer.isActive || restrictedSourceIdentity[offer.sourceIdentityHash] || offer.expiresAt < block.timestamp || offer.proofType != proofType || offer.reserved >= offer.capacity) revert OfferUnavailable();
            offer.reserved += 1;
        }
        _pull(token, msg.sender, reward);
        id = ++bountyCount;
        bounties[id] = Bounty({
            requester: msg.sender,
            taker: address(0),
            token: token,
            feeRecipient: roleHolder[Role.Treasury],
            reward: reward,
            retentionBond: retentionBond,
            acceptBy: acceptBy,
            dueAt: dueAt,
            reviewBy: reviewBy,
            retentionPeriod: retentionPeriod,
            retentionEndsAt: 0,
            caseReviewPeriod: caseReviewPeriod,
            caseResolveBy: 0,
            minimumFollowerCount: minimumFollowerCount,
            minimumEthosScore: minimumEthosScore,
            minimumKaitoScore: minimumKaitoScore,
            minimumKaitoAura: minimumKaitoAura,
            feeBpsSnapshot: defaultFeeBps,
            proofType: proofType,
            kind: BountyKind.SocialProof,
            state: BountyState.Open,
            caseDefaultToRequester: caseDefaultToRequester,
            requireVerifiedSource: requireVerifiedSource,
            offerId: offerId,
            termsHash: termsHash,
            metadataHash: metadataHash,
            targetActionHash: targetActionHash,
            sourceIdentityHash: bytes32(0),
            deliveryHash: bytes32(0),
            evidenceHash: bytes32(0)
        });
        emit BountyCreated(id, BountyKind.SocialProof, msg.sender, token, reward, retentionBond, acceptBy, dueAt, reviewBy, termsHash, metadataHash, targetActionHash, offerId, defaultFeeBps, roleHolder[Role.Treasury]);
    }

    function acceptBounty(uint256 id) external whenNotPaused {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Open || bounty.kind != BountyKind.General) revert InvalidState();
        if (msg.sender == bounty.requester) revert Unauthorized();
        if (block.timestamp > bounty.acceptBy) revert DeadlinePassed();
        bounty.taker = msg.sender;
        bounty.state = BountyState.Accepted;
        emit BountyAccepted(id, msg.sender, bytes32(0), bytes32(0));
    }

    function acceptSocialBounty(uint256 id, SourceAttestation calldata attestation, bytes calldata signature) external whenNotPaused nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Open || bounty.kind != BountyKind.SocialProof) revert InvalidState();
        if (msg.sender == bounty.requester || attestation.seller != msg.sender) revert Unauthorized();
        if (block.timestamp > bounty.acceptBy) revert DeadlinePassed();
        _validateSourceAttestation(attestation, signature);
        if (
            attestation.followerCount < bounty.minimumFollowerCount || attestation.ethosScore < bounty.minimumEthosScore
                || attestation.kaitoScore < bounty.minimumKaitoScore || attestation.kaitoAura < bounty.minimumKaitoAura
                || (bounty.requireVerifiedSource && !attestation.isVerifiedClaim)
        ) revert SourceRequirementsNotMet();
        if (bounty.offerId != 0) {
            SocialOffer storage offer = socialOffers[bounty.offerId];
            if (offer.seller != msg.sender || offer.sourceIdentityHash != attestation.sourceIdentityHash || offer.proofType != bounty.proofType) revert OfferUnavailable();
        }
        bytes32 sourceActionKey = keccak256(abi.encode(attestation.sourceIdentityHash, bounty.targetActionHash));
        if (usedSourceAction[sourceActionKey]) revert DuplicateSourceAction();
        usedSourceAction[sourceActionKey] = true;
        _pull(bounty.token, msg.sender, bounty.retentionBond);
        bounty.taker = msg.sender;
        bounty.sourceIdentityHash = attestation.sourceIdentityHash;
        bounty.state = BountyState.Accepted;
        emit BountyAccepted(id, msg.sender, attestation.sourceIdentityHash, attestation.metricsHash);
    }

    function submitBounty(uint256 id, bytes32 deliveryHash) external {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Accepted) revert InvalidState();
        if (msg.sender != bounty.taker) revert Unauthorized();
        if (block.timestamp > bounty.dueAt) revert DeadlinePassed();
        if (deliveryHash == bytes32(0)) revert InvalidCommitment();
        bounty.deliveryHash = deliveryHash;
        bounty.state = BountyState.Submitted;
        emit BountySubmitted(id, deliveryHash);
    }

    function approveBounty(uint256 id) external nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Submitted) revert InvalidState();
        if (msg.sender != bounty.requester) revert Unauthorized();
        _releaseSubmittedBounty(id, bounty);
    }

    function timeoutSubmittedBounty(uint256 id) external nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Submitted) revert InvalidState();
        if (block.timestamp <= bounty.reviewBy) revert DeadlineNotReached();
        _releaseSubmittedBounty(id, bounty);
    }

    function cancelUnacceptedBounty(uint256 id) external nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Open || msg.sender != bounty.requester) revert Unauthorized();
        bounty.state = BountyState.Cancelled;
        _releaseOfferReservation(bounty);
        _push(bounty.token, bounty.requester, bounty.reward);
        emit BountyCancelled(id);
    }

    function expireUnacceptedBounty(uint256 id) external nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Open) revert InvalidState();
        if (block.timestamp <= bounty.acceptBy) revert DeadlineNotReached();
        bounty.state = BountyState.Expired;
        _releaseOfferReservation(bounty);
        _push(bounty.token, bounty.requester, bounty.reward);
        emit BountyExpired(id, BountyState.Open);
    }

    function timeoutAcceptedBounty(uint256 id) external nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Accepted) revert InvalidState();
        if (block.timestamp <= bounty.dueAt) revert DeadlineNotReached();
        bounty.state = BountyState.Expired;
        _releaseOfferReservation(bounty);
        _push(bounty.token, bounty.requester, bounty.reward);
        if (bounty.kind == BountyKind.SocialProof) _push(bounty.token, bounty.taker, bounty.retentionBond);
        emit BountyExpired(id, BountyState.Accepted);
    }

    function disputeBounty(uint256 id) external {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Accepted && bounty.state != BountyState.Submitted) revert InvalidState();
        if (msg.sender != bounty.requester && msg.sender != bounty.taker) revert Unauthorized();
        bounty.state = BountyState.Disputed;
        emit BountyDisputed(id, msg.sender);
    }

    function resolveBountyDispute(uint256 id, uint128 requesterPayout, uint128 takerPayout, uint128 requesterBondPayout) external onlyArbiter nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.state != BountyState.Disputed) revert InvalidState();
        uint256 fee = _fee(bounty.reward, bounty.feeBpsSnapshot);
        uint256 netReward = uint256(bounty.reward) - fee;
        if (uint256(requesterPayout) + uint256(takerPayout) != netReward) revert InvalidPayout();
        uint256 takerBondPayout;
        if (bounty.kind == BountyKind.SocialProof) {
            if (requesterBondPayout > bounty.retentionBond) revert InvalidPayout();
            takerBondPayout = uint256(bounty.retentionBond) - requesterBondPayout;
        } else if (requesterBondPayout != 0) revert InvalidPayout();
        bounty.state = BountyState.Settled;
        accruedFees[bounty.token] += fee;
        if (requesterPayout != 0) _push(bounty.token, bounty.requester, requesterPayout);
        if (takerPayout != 0) _push(bounty.token, bounty.taker, takerPayout);
        if (requesterBondPayout != 0) _push(bounty.token, bounty.requester, requesterBondPayout);
        if (takerBondPayout != 0) _push(bounty.token, bounty.taker, takerBondPayout);
        emit BountyResolved(id, requesterPayout, takerPayout, requesterBondPayout, takerBondPayout, fee);
    }

    function openRetentionCase(uint256 id, bytes32 evidenceHash) external {
        Bounty storage bounty = bounties[id];
        if (bounty.kind != BountyKind.SocialProof || bounty.state != BountyState.RetentionActive) revert InvalidState();
        if (msg.sender != bounty.requester) revert Unauthorized();
        if (block.timestamp >= bounty.retentionEndsAt) revert DeadlinePassed();
        if (evidenceHash == bytes32(0)) revert InvalidCommitment();
        bounty.evidenceHash = evidenceHash;
        bounty.caseResolveBy = uint64(block.timestamp + bounty.caseReviewPeriod);
        bounty.state = BountyState.RetentionCase;
        emit RetentionCaseOpened(id, evidenceHash, bounty.caseResolveBy);
    }

    function resolveRetentionCase(uint256 id, bool confirmed) external onlyArbiter nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.kind != BountyKind.SocialProof || bounty.state != BountyState.RetentionCase) revert InvalidState();
        bounty.caseResolveBy = 0;
        if (confirmed) {
            bounty.state = BountyState.Settled;
            restrictedSourceIdentity[bounty.sourceIdentityHash] = true;
            _push(bounty.token, bounty.requester, bounty.retentionBond);
            emit SourceIdentityRestricted(bounty.sourceIdentityHash, id, msg.sender);
            emit RetentionCaseResolved(id, true, bounty.retentionBond, 0);
        } else {
            bounty.state = BountyState.RetentionActive;
            emit RetentionCaseResolved(id, false, 0, 0);
        }
    }

    function timeoutRetentionCase(uint256 id) external nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.kind != BountyKind.SocialProof || bounty.state != BountyState.RetentionCase) revert InvalidState();
        if (block.timestamp <= bounty.caseResolveBy) revert DeadlineNotReached();
        bounty.state = BountyState.Settled;
        uint256 requesterPayout = bounty.caseDefaultToRequester ? bounty.retentionBond : 0;
        uint256 takerPayout = uint256(bounty.retentionBond) - requesterPayout;
        if (requesterPayout != 0) _push(bounty.token, bounty.requester, requesterPayout);
        if (takerPayout != 0) _push(bounty.token, bounty.taker, takerPayout);
        emit RetentionCaseResolved(id, false, requesterPayout, takerPayout);
    }

    function releaseRetentionBond(uint256 id) external nonReentrant {
        Bounty storage bounty = bounties[id];
        if (bounty.kind != BountyKind.SocialProof || bounty.state != BountyState.RetentionActive) revert InvalidState();
        if (block.timestamp < bounty.retentionEndsAt) revert DeadlineNotReached();
        bounty.state = BountyState.Paid;
        _push(bounty.token, bounty.taker, bounty.retentionBond);
        emit RetentionBondReleased(id, bounty.taker, bounty.retentionBond);
    }

    function createAgreement(
        address token,
        address taker,
        uint128 collateral,
        uint64 acceptBy,
        uint64 settlementBy,
        uint16 makerDeclinePayoutBps,
        uint16 makerTimeoutPayoutBps,
        bytes32 termsHash,
        bytes32 metadataHash
    ) external whenNotPaused nonReentrant returns (uint256 id) {
        if (!allowedToken[token]) revert InvalidToken();
        if (taker == address(0) || taker == msg.sender) revert InvalidAddress();
        if (collateral == 0 || termsHash == bytes32(0) || metadataHash == bytes32(0)) revert InvalidCommitment();
        if (acceptBy <= block.timestamp || settlementBy <= acceptBy) revert InvalidDeadline();
        if (makerDeclinePayoutBps > BASIS_POINTS || makerTimeoutPayoutBps > BASIS_POINTS) revert InvalidBps();
        _pull(token, msg.sender, collateral);
        id = ++agreementCount;
        agreements[id] = Agreement({
            maker: msg.sender,
            taker: taker,
            token: token,
            feeRecipient: roleHolder[Role.Treasury],
            collateral: collateral,
            acceptBy: acceptBy,
            settlementBy: settlementBy,
            feeBpsSnapshot: defaultFeeBps,
            makerDeclinePayoutBps: makerDeclinePayoutBps,
            makerTimeoutPayoutBps: makerTimeoutPayoutBps,
            state: AgreementState.Open,
            termsHash: termsHash,
            metadataHash: metadataHash
        });
        emit AgreementCreated(id, msg.sender, taker, token, collateral, acceptBy, settlementBy, makerDeclinePayoutBps, makerTimeoutPayoutBps, termsHash, metadataHash, defaultFeeBps, roleHolder[Role.Treasury]);
    }

    function acceptAgreement(uint256 id) external whenNotPaused nonReentrant {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Open) revert InvalidState();
        if (msg.sender != agreement.taker) revert Unauthorized();
        if (block.timestamp > agreement.acceptBy) revert DeadlinePassed();
        _pull(agreement.token, msg.sender, agreement.collateral);
        agreement.state = AgreementState.Funded;
        emit AgreementAccepted(id, msg.sender);
    }

    function cancelUnacceptedAgreement(uint256 id) external nonReentrant {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Open || msg.sender != agreement.maker) revert Unauthorized();
        agreement.state = AgreementState.Cancelled;
        _push(agreement.token, agreement.maker, agreement.collateral);
        emit AgreementCancelled(id);
    }

    function expireUnacceptedAgreement(uint256 id) external nonReentrant {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Open) revert InvalidState();
        if (block.timestamp <= agreement.acceptBy) revert DeadlineNotReached();
        agreement.state = AgreementState.Expired;
        _push(agreement.token, agreement.maker, agreement.collateral);
        emit AgreementExpired(id);
    }

    function settleAgreementWithSignatures(
        uint256 id,
        uint128 makerPayout,
        uint128 takerPayout,
        uint64 signatureDeadline,
        uint256 nonce,
        bytes calldata makerSignature,
        bytes calldata takerSignature
    ) external nonReentrant {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Funded) revert InvalidState();
        if (block.timestamp > agreement.settlementBy || block.timestamp > signatureDeadline) revert DeadlinePassed();
        bytes32 digest = _hashAgreementSettlement(id, makerPayout, takerPayout, signatureDeadline, nonce);
        if (usedSettlementAuthorizations[digest]) revert AuthorizationAlreadyUsed();
        if (_recover(digest, makerSignature) != agreement.maker || _recover(digest, takerSignature) != agreement.taker) revert InvalidSignature();
        usedSettlementAuthorizations[digest] = true;
        _settleAgreement(id, agreement, makerPayout, takerPayout, false);
    }

    function declineAgreement(uint256 id) external nonReentrant {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Funded || msg.sender != agreement.maker) revert Unauthorized();
        if (block.timestamp > agreement.settlementBy) revert DeadlinePassed();
        (uint128 makerPayout, uint128 takerPayout) = _agreementPayoutsFromBps(agreement, agreement.makerDeclinePayoutBps);
        _settleAgreement(id, agreement, makerPayout, takerPayout, false);
    }

    function timeoutAgreement(uint256 id) external nonReentrant {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Funded) revert InvalidState();
        if (block.timestamp <= agreement.settlementBy) revert DeadlineNotReached();
        (uint128 makerPayout, uint128 takerPayout) = _agreementPayoutsFromBps(agreement, agreement.makerTimeoutPayoutBps);
        _settleAgreement(id, agreement, makerPayout, takerPayout, false);
    }

    function disputeAgreement(uint256 id) external {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Funded) revert InvalidState();
        if (msg.sender != agreement.maker && msg.sender != agreement.taker) revert Unauthorized();
        agreement.state = AgreementState.Disputed;
        emit AgreementDisputed(id, msg.sender);
    }

    function resolveAgreement(uint256 id, uint128 makerPayout, uint128 takerPayout) external onlyArbiter nonReentrant {
        Agreement storage agreement = agreements[id];
        if (agreement.state != AgreementState.Disputed) revert InvalidState();
        _settleAgreement(id, agreement, makerPayout, takerPayout, true);
    }

    function withdrawAccruedFees(address token, uint256 amount) external nonReentrant {
        if (msg.sender != roleHolder[Role.Treasury]) revert Unauthorized();
        if (amount == 0 || amount > accruedFees[token]) revert InvalidAmount();
        accruedFees[token] -= amount;
        _push(token, roleHolder[Role.Treasury], amount);
        emit FeesWithdrawn(token, roleHolder[Role.Treasury], amount);
    }

    function _releaseSubmittedBounty(uint256 id, Bounty storage bounty) private {
        uint256 fee = _fee(bounty.reward, bounty.feeBpsSnapshot);
        uint256 payout = uint256(bounty.reward) - fee;
        accruedFees[bounty.token] += fee;
        _push(bounty.token, bounty.taker, payout);
        emit BountyPaid(id, bounty.taker, payout, fee);
        if (bounty.kind == BountyKind.SocialProof) {
            bounty.retentionEndsAt = uint64(block.timestamp + bounty.retentionPeriod);
            bounty.state = BountyState.RetentionActive;
            emit RetentionStarted(id, bounty.sourceIdentityHash, bounty.retentionEndsAt);
        } else {
            bounty.state = BountyState.Paid;
        }
    }

    function _settleAgreement(uint256 id, Agreement storage agreement, uint128 makerPayout, uint128 takerPayout, bool resolved) private {
        uint256 fee = _fee(uint256(agreement.collateral) * 2, agreement.feeBpsSnapshot);
        if (uint256(makerPayout) + uint256(takerPayout) != uint256(agreement.collateral) * 2 - fee) revert InvalidPayout();
        agreement.state = AgreementState.Settled;
        accruedFees[agreement.token] += fee;
        if (makerPayout != 0) _push(agreement.token, agreement.maker, makerPayout);
        if (takerPayout != 0) _push(agreement.token, agreement.taker, takerPayout);
        emit AgreementSettled(id, makerPayout, takerPayout, fee, resolved);
    }

    function _agreementPayoutsFromBps(Agreement storage agreement, uint16 makerPayoutBps) private view returns (uint128 makerPayout, uint128 takerPayout) {
        uint256 total = uint256(agreement.collateral) * 2;
        uint256 net = total - _fee(total, agreement.feeBpsSnapshot);
        makerPayout = uint128((net * makerPayoutBps) / BASIS_POINTS);
        takerPayout = uint128(net - makerPayout);
    }

    function _validateBountyCreate(address token, uint128 reward, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, bytes32 termsHash, bytes32 metadataHash) private view {
        if (!allowedToken[token]) revert InvalidToken();
        if (reward == 0) revert InvalidAmount();
        if (termsHash == bytes32(0) || metadataHash == bytes32(0)) revert InvalidCommitment();
        if (acceptBy <= block.timestamp || dueAt <= acceptBy || reviewBy <= dueAt) revert InvalidDeadline();
    }

    function _setDefaultFee(uint16 nextFeeBps) private {
        if (nextFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        defaultFeeBps = nextFeeBps;
        emit DefaultFeeConfigured(nextFeeBps);
    }

    function _hashSourceAttestation(SourceAttestation calldata attestation) private view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(SOURCE_ATTESTATION_TYPEHASH, attestation.seller, attestation.sourceIdentityHash, attestation.metricsHash, attestation.followerCount, attestation.ethosScore, attestation.kaitoScore, attestation.kaitoAura, attestation.isVerifiedClaim, attestation.validUntil, attestation.nonce));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparatorV4(), structHash));
    }

    function _validateSourceAttestation(SourceAttestation calldata attestation, bytes calldata signature) private view returns (bytes32 digest) {
        if (attestation.sourceIdentityHash == bytes32(0) || attestation.validUntil < block.timestamp) revert AttestationExpired();
        if (restrictedSourceIdentity[attestation.sourceIdentityHash]) revert SourceRestricted();
        digest = _hashSourceAttestation(attestation);
        if (revokedSourceAttestations[digest] || _recover(digest, signature) != roleHolder[Role.SourceAttester]) revert InvalidSignature();
    }

    function _releaseOfferReservation(Bounty storage bounty) private {
        if (bounty.kind != BountyKind.SocialProof || bounty.offerId == 0) return;
        SocialOffer storage offer = socialOffers[bounty.offerId];
        if (offer.reserved != 0) offer.reserved -= 1;
    }

    function _hashAgreementSettlement(uint256 agreementId, uint128 makerPayout, uint128 takerPayout, uint64 deadline, uint256 nonce) private view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(AGREEMENT_SETTLEMENT_TYPEHASH, agreementId, makerPayout, takerPayout, deadline, nonce));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparatorV4(), structHash));
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > uint256(HALF_ORDER) || (v != 27 && v != 28)) revert InvalidSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    function _fee(uint256 amount, uint16 feeBps) private pure returns (uint256) {
        return (amount * feeBps) / BASIS_POINTS;
    }

    function _pull(address token, address from, uint256 amount) private {
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20V2.transferFrom.selector, from, address(this), amount));
    }

    function _push(address token, address to, uint256 amount) private {
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20V2.transfer.selector, to, amount));
    }

    function _callOptionalReturn(address token, bytes memory data) private {
        (bool success, bytes memory returndata) = token.call(data);
        if (!success || (returndata.length != 0 && !abi.decode(returndata, (bool)))) revert TransferFailed();
    }
}
