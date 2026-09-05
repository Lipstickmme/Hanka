import { readFileSync } from "node:fs";
import path from "node:path";
import solc from "solc";
import { describe, expect, it } from "vitest";

const sourcePath = path.resolve(process.cwd(), "contracts/src/HankaArcEscrow.sol");
const source = readFileSync(sourcePath, "utf8");
const compiled = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { "HankaArcEscrow.sol": { content: source } }, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } })));
const compilerErrors = (compiled.errors ?? []).filter((item: { severity: string }) => item.severity === "error");
const contract = compiled.contracts?.["HankaArcEscrow.sol"]?.HankaArcEscrow;

describe("Hanka Arc escrow contract", () => {
  it("compiles an immutable ERC-20 escrow contract without native-value custody", () => {
    expect(compilerErrors).toEqual([]);
    expect(contract.evm.bytecode.object.length).toBeGreaterThan(10_000);
    expect(source).toContain("receive() external payable { revert NativeValueNotAccepted(); }");
    expect(source).not.toContain("selfdestruct");
  });

  it("exposes distinct collateral-exchange and first-valid-acceptance task workflows", () => {
    const functions = contract.abi.filter((item: { type: string }) => item.type === "function").map((item: { name: string }) => item.name);
    expect(functions).toEqual(expect.arrayContaining(["createPointExchange", "acceptPointExchange", "approvePointExchangeSettlement", "declinePointExchange", "disputePointExchange", "resolvePointExchange", "pointExchangeToken", "pointExchangeCount", "createTask", "acceptTask", "submitTask", "approveTask", "disputeTask", "resolveTask", "taskToken", "taskCount"]));
    expect(source).toContain("The first valid onchain transaction wins task acceptance.");
  });

  it("caps fees, restricts dispute resolution, and requires a delayed resolver or treasury change", () => {
    expect(source).toContain("uint16 public constant MAX_FEE_BPS = 1_000;");
    expect(source).toContain("function resolvePointExchange(uint256 id, uint128 makerPayout, uint128 takerPayout) external onlyResolver nonReentrant");
    expect(source).toContain("function resolveTask(uint256 id, uint128 requesterPayout, uint128 takerPayout) external onlyResolver nonReentrant");
    expect(source).toContain("uint64 public constant ROLE_CHANGE_DELAY = 48 hours;");
  });
});
