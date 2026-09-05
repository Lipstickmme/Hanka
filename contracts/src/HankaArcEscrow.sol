// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal ERC-20 interface used for Arc's USDC ERC-20 interface, EURC, and cirBTC.
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title HankaArcEscrow
/// @notice Testnet-only, immutable ERC-20 escrow for bilateral point exchanges and task rewards.
/// @dev Detailed task content and airdrop evidence remain offchain; this contract stores only hashes.
contract HankaArcEscrow {
    uint16 public constant BASIS_POINTS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint64 public constant ROLE_CHANGE_DELAY = 48 hours;

    enum PointExchangeState { None, Open, Funded, Disputed, Settled, Declined, Cancelled }
    enum TaskState { None, Open, Accepted, Submitted, Disputed, Paid, Cancelled }

    struct PointExchange {
        address maker;
        address taker;
        address token;
        uint128 collateral;
        uint64 acceptDeadline;
        uint64 settlementDeadline;
        bytes32 termsHash;
        bytes32 makerApprovalHash;
        bytes32 takerApprovalHash;
        PointExchangeState state;
    }

    struct Task {
        address requester;
        address taker;
        address token;
        uint128 reward;
        uint64 acceptDeadline;
        uint64 dueAt;
        bytes32 termsHash;
        bytes32 deliveryHash;
        TaskState state;
    }

    error Unauthorized();
    error InvalidAddress();
    error InvalidToken();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidState();
    error InvalidTerms();
    error FeeTooHigh();
    error DeadlinePassed();
    error SettlementNotExpired();
    error InvalidSettlement();
    error TransferFailed();
    error Reentrancy();
    error NativeValueNotAccepted();
    error RoleChangeNotReady();

    address public immutable owner;
    address public resolver;
    address public treasury;
    address public pendingResolver;
    address public pendingTreasury;
    uint64 public resolverChangeReadyAt;
    uint64 public treasuryChangeReadyAt;
    uint16 public feeBps;
    uint256 private nextPointExchangeId = 1;
    uint256 private nextTaskId = 1;
    uint256 private unlocked = 1;

    mapping(address => bool) public allowedToken;
    mapping(address => uint256) public accruedFees;
    mapping(uint256 => PointExchange) public pointExchanges;
    mapping(uint256 => Task) public tasks;

    event TokenConfigured(address indexed token, bool allowed);
    event FeeConfigured(uint16 feeBps);
    event ResolverChangeProposed(address indexed resolver, uint64 readyAt);
    event ResolverChanged(address indexed resolver);
    event TreasuryChangeProposed(address indexed treasury, uint64 readyAt);
    event TreasuryChanged(address indexed treasury);
    event PointExchangeCreated(uint256 indexed id, address indexed maker, address indexed taker, address token, uint256 collateral, uint64 acceptDeadline, uint64 settlementDeadline, bytes32 termsHash);
    event PointExchangeAccepted(uint256 indexed id, address indexed taker);
    event PointExchangeSettlementApproved(uint256 indexed id, address indexed participant, bytes32 approvalHash);
    event PointExchangeSettled(uint256 indexed id, uint256 makerPayout, uint256 takerPayout, uint256 fee);
    event PointExchangeDeclined(uint256 indexed id, uint256 takerPayout, uint256 fee);
    event PointExchangeCancelled(uint256 indexed id);
    event PointExchangeDisputed(uint256 indexed id, address indexed raisedBy);
    event PointExchangeResolved(uint256 indexed id, uint256 makerPayout, uint256 takerPayout, uint256 fee);
    event TaskCreated(uint256 indexed id, address indexed requester, address token, uint256 reward, uint64 acceptDeadline, uint64 dueAt, bytes32 termsHash);
    event TaskAccepted(uint256 indexed id, address indexed taker);
    event TaskSubmitted(uint256 indexed id, bytes32 deliveryHash);
    event TaskPaid(uint256 indexed id, address indexed taker, uint256 payout, uint256 fee);
    event TaskCancelled(uint256 indexed id);
    event TaskDisputed(uint256 indexed id, address indexed raisedBy);
    event TaskResolved(uint256 indexed id, uint256 requesterPayout, uint256 takerPayout, uint256 fee);
    event FeesWithdrawn(address indexed token, address indexed treasury, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(address initialOwner, address initialResolver, address initialTreasury, address[] memory initialTokens, uint16 initialFeeBps) {
        if (initialOwner == address(0) || initialResolver == address(0) || initialTreasury == address(0)) revert InvalidAddress();
        owner = initialOwner;
        resolver = initialResolver;
        treasury = initialTreasury;
        _setFee(initialFeeBps);
        for (uint256 i; i < initialTokens.length; ++i) {
            if (initialTokens[i] == address(0)) revert InvalidAddress();
            allowedToken[initialTokens[i]] = true;
            emit TokenConfigured(initialTokens[i], true);
        }
    }

    /// @notice Arc native USDC uses special value-transfer rules. This contract intentionally accepts no native value.
    receive() external payable { revert NativeValueNotAccepted(); }
    fallback() external payable { revert NativeValueNotAccepted(); }

    function configureToken(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        allowedToken[token] = allowed;
        emit TokenConfigured(token, allowed);
    }

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        _setFee(newFeeBps);
    }

    function proposeResolver(address nextResolver) external onlyOwner {
        if (nextResolver == address(0)) revert InvalidAddress();
        pendingResolver = nextResolver;
        resolverChangeReadyAt = uint64(block.timestamp + ROLE_CHANGE_DELAY);
        emit ResolverChangeProposed(nextResolver, resolverChangeReadyAt);
    }

    function acceptResolver() external onlyOwner {
        if (pendingResolver == address(0)) revert InvalidAddress();
        if (block.timestamp < resolverChangeReadyAt) revert RoleChangeNotReady();
        resolver = pendingResolver;
        pendingResolver = address(0);
        resolverChangeReadyAt = 0;
        emit ResolverChanged(resolver);
    }

    function proposeTreasury(address nextTreasury) external onlyOwner {
        if (nextTreasury == address(0)) revert InvalidAddress();
        pendingTreasury = nextTreasury;
        treasuryChangeReadyAt = uint64(block.timestamp + ROLE_CHANGE_DELAY);
        emit TreasuryChangeProposed(nextTreasury, treasuryChangeReadyAt);
    }

    function acceptTreasury() external onlyOwner {
        if (pendingTreasury == address(0)) revert InvalidAddress();
        if (block.timestamp < treasuryChangeReadyAt) revert RoleChangeNotReady();
        treasury = pendingTreasury;
        pendingTreasury = address(0);
        treasuryChangeReadyAt = 0;
        emit TreasuryChanged(treasury);
    }

    function createPointExchange(address token, address taker, uint128 collateral, uint64 acceptDeadline, uint64 settlementDeadline, bytes32 termsHash) external nonReentrant returns (uint256 id) {
        if (!allowedToken[token]) revert InvalidToken();
        if (taker == address(0) || taker == msg.sender) revert InvalidAddress();
        if (collateral == 0) revert InvalidAmount();
        if (termsHash == bytes32(0)) revert InvalidTerms();
        if (acceptDeadline <= block.timestamp || settlementDeadline <= acceptDeadline) revert InvalidDeadline();
        _safeTransferFrom(token, msg.sender, address(this), collateral);
        id = nextPointExchangeId++;
        pointExchanges[id] = PointExchange({ maker: msg.sender, taker: taker, token: token, collateral: collateral, acceptDeadline: acceptDeadline, settlementDeadline: settlementDeadline, termsHash: termsHash, makerApprovalHash: bytes32(0), takerApprovalHash: bytes32(0), state: PointExchangeState.Open });
        emit PointExchangeCreated(id, msg.sender, taker, token, collateral, acceptDeadline, settlementDeadline, termsHash);
    }

    function acceptPointExchange(uint256 id) external nonReentrant {
        PointExchange storage exchange = pointExchanges[id];
        if (exchange.state != PointExchangeState.Open) revert InvalidState();
        if (msg.sender != exchange.taker) revert Unauthorized();
        if (block.timestamp > exchange.acceptDeadline) revert DeadlinePassed();
        _safeTransferFrom(exchange.token, msg.sender, address(this), exchange.collateral);
        exchange.state = PointExchangeState.Funded;
        emit PointExchangeAccepted(id, msg.sender);
    }

    function cancelUnacceptedPointExchange(uint256 id) external nonReentrant {
        PointExchange storage exchange = pointExchanges[id];
        if (exchange.state != PointExchangeState.Open) revert InvalidState();
        if (msg.sender != exchange.maker) revert Unauthorized();
        exchange.state = PointExchangeState.Cancelled;
        _safeTransfer(exchange.token, exchange.maker, exchange.collateral);
        emit PointExchangeCancelled(id);
    }

    /// @notice Both parties approve the exact same offchain settlement hash and payout amounts before funds move.
    function approvePointExchangeSettlement(uint256 id, bytes32 settlementHash, uint128 makerPayout, uint128 takerPayout) external nonReentrant {
        PointExchange storage exchange = pointExchanges[id];
        if (exchange.state != PointExchangeState.Funded) revert InvalidState();
        if (block.timestamp > exchange.settlementDeadline) revert DeadlinePassed();
        if (msg.sender != exchange.maker && msg.sender != exchange.taker) revert Unauthorized();
        bytes32 approvalHash = keccak256(abi.encode(exchange.termsHash, settlementHash, makerPayout, takerPayout));
        _validatePointExchangePayout(exchange, makerPayout, takerPayout);
        if (msg.sender == exchange.maker) exchange.makerApprovalHash = approvalHash;
        else exchange.takerApprovalHash = approvalHash;
        emit PointExchangeSettlementApproved(id, msg.sender, approvalHash);
        if (exchange.makerApprovalHash != bytes32(0) && exchange.makerApprovalHash == exchange.takerApprovalHash) {
            _settlePointExchange(exchange, id, makerPayout, takerPayout, false);
        }
    }

    /// @notice The listing maker's explicit decline awards both deposits less the configured fee to the counterparty.
    function declinePointExchange(uint256 id) external nonReentrant {
        PointExchange storage exchange = pointExchanges[id];
        if (exchange.state != PointExchangeState.Funded) revert InvalidState();
        if (msg.sender != exchange.maker) revert Unauthorized();
        if (block.timestamp > exchange.settlementDeadline) revert DeadlinePassed();
        exchange.state = PointExchangeState.Declined;
        uint256 fee = _fee(exchange.collateral);
        uint256 takerPayout = uint256(exchange.collateral) * 2 - fee;
        accruedFees[exchange.token] += fee;
        _safeTransfer(exchange.token, exchange.taker, takerPayout);
        emit PointExchangeDeclined(id, takerPayout, fee);
    }

    function disputePointExchange(uint256 id) external {
        PointExchange storage exchange = pointExchanges[id];
        if (exchange.state != PointExchangeState.Funded) revert InvalidState();
        if (msg.sender != exchange.maker && msg.sender != exchange.taker) revert Unauthorized();
        exchange.state = PointExchangeState.Disputed;
        emit PointExchangeDisputed(id, msg.sender);
    }

    /// @notice The resolver may settle only a record already opened as a dispute and cannot pull unrelated escrow.
    function resolvePointExchange(uint256 id, uint128 makerPayout, uint128 takerPayout) external onlyResolver nonReentrant {
        PointExchange storage exchange = pointExchanges[id];
        if (exchange.state != PointExchangeState.Disputed) revert InvalidState();
        _validatePointExchangePayout(exchange, makerPayout, takerPayout);
        _settlePointExchange(exchange, id, makerPayout, takerPayout, true);
    }

    function createTask(address token, uint128 reward, uint64 acceptDeadline, uint64 dueAt, bytes32 termsHash) external nonReentrant returns (uint256 id) {
        if (!allowedToken[token]) revert InvalidToken();
        if (reward == 0) revert InvalidAmount();
        if (termsHash == bytes32(0)) revert InvalidTerms();
        if (acceptDeadline <= block.timestamp || dueAt <= acceptDeadline) revert InvalidDeadline();
        _safeTransferFrom(token, msg.sender, address(this), reward);
        id = nextTaskId++;
        tasks[id] = Task({ requester: msg.sender, taker: address(0), token: token, reward: reward, acceptDeadline: acceptDeadline, dueAt: dueAt, termsHash: termsHash, deliveryHash: bytes32(0), state: TaskState.Open });
        emit TaskCreated(id, msg.sender, token, reward, acceptDeadline, dueAt, termsHash);
    }

    /// @notice The first valid onchain transaction wins task acceptance.
    function acceptTask(uint256 id) external {
        Task storage task = tasks[id];
        if (task.state != TaskState.Open) revert InvalidState();
        if (msg.sender == task.requester) revert Unauthorized();
        if (block.timestamp > task.acceptDeadline) revert DeadlinePassed();
        task.taker = msg.sender;
        task.state = TaskState.Accepted;
        emit TaskAccepted(id, msg.sender);
    }

    function cancelUnacceptedTask(uint256 id) external nonReentrant {
        Task storage task = tasks[id];
        if (task.state != TaskState.Open) revert InvalidState();
        if (msg.sender != task.requester) revert Unauthorized();
        task.state = TaskState.Cancelled;
        _safeTransfer(task.token, task.requester, task.reward);
        emit TaskCancelled(id);
    }

    function submitTask(uint256 id, bytes32 deliveryHash) external {
        Task storage task = tasks[id];
        if (task.state != TaskState.Accepted) revert InvalidState();
        if (msg.sender != task.taker) revert Unauthorized();
        if (deliveryHash == bytes32(0)) revert InvalidTerms();
        if (block.timestamp > task.dueAt) revert DeadlinePassed();
        task.deliveryHash = deliveryHash;
        task.state = TaskState.Submitted;
        emit TaskSubmitted(id, deliveryHash);
    }

    function approveTask(uint256 id) external nonReentrant {
        Task storage task = tasks[id];
        if (task.state != TaskState.Submitted) revert InvalidState();
        if (msg.sender != task.requester) revert Unauthorized();
        task.state = TaskState.Paid;
        uint256 fee = _fee(task.reward);
        uint256 payout = uint256(task.reward) - fee;
        accruedFees[task.token] += fee;
        _safeTransfer(task.token, task.taker, payout);
        emit TaskPaid(id, task.taker, payout, fee);
    }

    function disputeTask(uint256 id) external {
        Task storage task = tasks[id];
        if (task.state != TaskState.Accepted && task.state != TaskState.Submitted) revert InvalidState();
        if (msg.sender != task.requester && msg.sender != task.taker) revert Unauthorized();
        task.state = TaskState.Disputed;
        emit TaskDisputed(id, msg.sender);
    }

    function resolveTask(uint256 id, uint128 requesterPayout, uint128 takerPayout) external onlyResolver nonReentrant {
        Task storage task = tasks[id];
        if (task.state != TaskState.Disputed) revert InvalidState();
        uint256 fee = _fee(task.reward);
        if (uint256(requesterPayout) + uint256(takerPayout) != uint256(task.reward) - fee) revert InvalidSettlement();
        task.state = TaskState.Paid;
        accruedFees[task.token] += fee;
        if (requesterPayout != 0) _safeTransfer(task.token, task.requester, requesterPayout);
        if (takerPayout != 0) _safeTransfer(task.token, task.taker, takerPayout);
        emit TaskResolved(id, requesterPayout, takerPayout, fee);
    }

    function withdrawAccruedFees(address token, uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0 || amount > accruedFees[token]) revert InvalidAmount();
        accruedFees[token] -= amount;
        _safeTransfer(token, treasury, amount);
        emit FeesWithdrawn(token, treasury, amount);
    }

    /// @notice Provides the settlement token for UI precision handling without exposing offchain agreement details.
    function pointExchangeToken(uint256 id) external view returns (address) {
        return pointExchanges[id].token;
    }

    /// @notice Provides the settlement token for UI precision handling without exposing offchain task details.
    function taskToken(uint256 id) external view returns (address) {
        return tasks[id].token;
    }

    /// @notice Record counts support read-only client discovery during the small-scale Testnet phase.
    /// @dev Production indexing should consume emitted events rather than scan all record IDs.
    function pointExchangeCount() external view returns (uint256) {
        return nextPointExchangeId - 1;
    }

    /// @notice Record counts support read-only client discovery during the small-scale Testnet phase.
    /// @dev Production indexing should consume emitted events rather than scan all record IDs.
    function taskCount() external view returns (uint256) {
        return nextTaskId - 1;
    }

    function _setFee(uint16 newFeeBps) private {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = newFeeBps;
        emit FeeConfigured(newFeeBps);
    }

    function _validatePointExchangePayout(PointExchange storage exchange, uint128 makerPayout, uint128 takerPayout) private view {
        uint256 total = uint256(exchange.collateral) * 2;
        if (uint256(makerPayout) + uint256(takerPayout) != total - _fee(total)) revert InvalidSettlement();
    }

    function _settlePointExchange(PointExchange storage exchange, uint256 id, uint128 makerPayout, uint128 takerPayout, bool resolverSettlement) private {
        exchange.state = PointExchangeState.Settled;
        uint256 total = uint256(exchange.collateral) * 2;
        uint256 fee = _fee(total);
        accruedFees[exchange.token] += fee;
        if (makerPayout != 0) _safeTransfer(exchange.token, exchange.maker, makerPayout);
        if (takerPayout != 0) _safeTransfer(exchange.token, exchange.taker, takerPayout);
        if (resolverSettlement) emit PointExchangeResolved(id, makerPayout, takerPayout, fee);
        else emit PointExchangeSettled(id, makerPayout, takerPayout, fee);
    }

    function _fee(uint256 amount) private view returns (uint256) {
        return (amount * feeBps) / BASIS_POINTS;
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount));
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount));
    }

    function _callOptionalReturn(address token, bytes memory data) private {
        (bool success, bytes memory returndata) = token.call(data);
        if (!success || (returndata.length != 0 && !abi.decode(returndata, (bool)))) revert TransferFailed();
    }
}
