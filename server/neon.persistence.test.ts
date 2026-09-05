import { describe, expect, it } from "vitest";
import { databaseUrl, isNeonPostgresUrl } from "./db";

describe("Neon persistence configuration", () => {
  it("uses the Neon-managed DATABASE_URL and rejects legacy MySQL connection strings", () => {
    expect(databaseUrl({ DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/neondb?sslmode=require" } as NodeJS.ProcessEnv)).toContain("neon.tech");
    expect(isNeonPostgresUrl("postgresql://user:pass@ep-example.neon.tech/neondb?sslmode=require")).toBe(true);
    expect(isNeonPostgresUrl("mysql://legacy.example/database")).toBe(false);
  });

  it("supports the POSTGRES_URL fallback exposed by some Vercel integrations", () => {
    expect(databaseUrl({ POSTGRES_URL: "postgres://user:pass@ep-example.neon.tech/neondb?sslmode=require" } as NodeJS.ProcessEnv)).toContain("postgres://");
  });
});
