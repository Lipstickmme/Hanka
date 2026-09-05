import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("terminal typing animation", () => {
  it("assigns the cursor to the active typing line only", () => {
    expect(homeSource).toContain("const [typingLine, setTypingLine]");
    expect(homeSource).toContain("setTypingLine(activeLineIndex)");
    expect(homeSource).toContain('index === typingLine ? "terminal-typing" : ""');
    expect(homeSource).not.toContain('typedLines[index].length < line.length ? "terminal-typing"');
  });

  it("reveals complete commands without hiding or abbreviating trailing text", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
    expect(homeSource).toContain('"connect EVM / Arc"');
    expect(homeSource).toContain('"fund Bounty / USDC"');
    expect(homeSource).toContain('"claim source / proof"');
    expect(homeSource).toContain("const activeLineIndex = lineIndex");
    expect(homeSource).toContain("index === activeLineIndex ? line : value");
    expect(homeSource).not.toContain("line.slice(0,");
    expect(homeSource).not.toContain("wordIndex");
    expect(css).toContain("text-overflow: clip");
    expect(css).toContain("grid-template-columns: 1.25rem minmax(0, 1fr)");
    expect(css).not.toContain(".terminal-code-row code { overflow: hidden; text-overflow: ellipsis");
  });
});
