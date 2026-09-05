import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/components/BountyCreateDialog.tsx"), "utf8");
const market = readFileSync(resolve(process.cwd(), "client/src/pages/ArcMarket.tsx"), "utf8");

describe("HANKA Bounty creation modal", () => {
  it("keeps the form in a responsive dialog rather than the Bounty board", () => {
    expect(source).toContain("<Dialog open={props.open}");
    expect(market).toContain("setCreateOpen(true)");
    expect(market).toContain("<BountyCreateDialog");
    expect(market).toContain("CREATE BOUNTY");
  });

  it("requires concrete details and clearly describes actual contract and storage limits", () => {
    expect(source).toContain("Bounty details");
    expect(source).toContain("Deliverables *");
    expect(source).toContain("100 characters max");
    expect(source).toContain("Number of winners");
    expect(source).toContain("Multi-winner reward splits are not available");
    expect(source).toContain("Files are not uploaded to the Arc contract or HANKA storage");
    expect(source).toContain("QR scanning, geolocation, and third-party automated checks are not currently enabled");
    expect(source).toContain("does not request illegal, exploitative, prohibited");
  });
});
