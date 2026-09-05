import { and, eq } from "drizzle-orm";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { resolve } from "node:path";
import ws from "ws";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let database: ReturnType<typeof drizzle> | null = null;
let migrationPromise: Promise<void> | null = null;

export function databaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.DATABASE_URL ?? env.POSTGRES_URL ?? "";
}

export function isNeonPostgresUrl(value: string) {
  return /^postgres(?:ql)?:\/\//i.test(value);
}

// The production Neon integration injects DATABASE_URL. Local builds without it remain possible.
export async function getDb() {
  if (database) return database;
  const url = databaseUrl();
  if (!isNeonPostgresUrl(url)) {
    console.warn("[Database] A Neon PostgreSQL DATABASE_URL is required; the fresh market database is not configured");
    return null;
  }

  neonConfig.webSocketConstructor = ws;
  neonConfig.poolQueryViaFetch = true;
  const pool = new Pool({ connectionString: url });
  database = drizzle({ client: pool });
  migrationPromise ??= migrate(database, {
    migrationsFolder: resolve(process.cwd(), "drizzle/neon"),
  });
  await migrationPromise;
  return database;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field];
      updateSet[field] = user[field];
    }
  }
  if (user.role) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(and(eq(users.openId, openId))).limit(1);
  return result[0];
}
