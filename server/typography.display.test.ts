import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

describe("HANKA display typography", () => {
  it("loads the supplied Geist variable family for the largest display headings", () => {
    expect(html).toContain("family=Geist:ital,wght@0,100..900;1,100..900");
    expect(styles).toContain('.font-display { font-family: "Geist", "Instrument Sans", sans-serif; font-weight: 650; }');
    expect(styles).toContain('.terms-typing { min-height: 5.5rem; max-width: 20rem; font-family: "Geist", "Instrument Sans", sans-serif;');
  });

  it("does not retain the former display-serif dependency", () => {
    expect(html).not.toContain("DM+Serif+Display");
    expect(styles).not.toContain('"DM Serif Display"');
  });
});
