import { describe, expect, it } from "vitest";
import { accountPairLabel } from "./reconciliation";

describe("private operations reconciliation labels", () => {
  it("shows source and target accounts for a completed seller allocation", () => {
    expect(accountPairLabel({ sourceHandle: "maker_one", targetHandle: "buyer_one" })).toBe("@maker_one → @buyer_one");
  });

  it("keeps request-only target accounts and source-only offers identifiable in operations evidence", () => {
    expect(accountPairLabel({ targetHandle: "buyer_one" })).toBe("Target @buyer_one");
    expect(accountPairLabel({ profileHandle: "maker_one" })).toBe("Source @maker_one");
  });
});
