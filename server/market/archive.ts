import { and, eq, isNull, lte } from "drizzle-orm";
import { marketRequests, sellerCommitments } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { getDb } from "../db";

type ArchiveEntity = {
  publicId: string;
  createdAt: Date;
  archiveEligibleAt: Date;
  [key: string]: unknown;
};

const ARCHIVE_FIELDS = [
  "publicId",
  "targetHandle",
  "profileHandle",
  "sourceHandle",
  "instrument",
  "vouchBand",
  "requestedQuantity",
  "filledQuantity",
  "quantity",
  "pointsPerUnit",
  "pricePerVouch",
  "totalUsdc",
  "status",
  "createdAt",
  "updatedAt",
  "archiveEligibleAt",
] as const;

export function sanitizeArchiveRecord(record: ArchiveEntity) {
  return Object.fromEntries(
    ARCHIVE_FIELDS.flatMap(field => {
      const value = record[field];
      if (value === undefined || value === null) return [];
      return [[field, value instanceof Date ? value.toISOString() : value]];
    }),
  );
}

export function buildArchiveSnapshot(type: "request" | "seller_commitment", record: ArchiveEntity, capturedAt: Date) {
  return JSON.stringify({
    schemaVersion: 1,
    type,
    publicId: record.publicId,
    capturedAt: capturedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    archiveEligibleAt: record.archiveEligibleAt.toISOString(),
    record: sanitizeArchiveRecord(record),
  });
}

async function archiveRequests(now: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const records = await db
    .select()
    .from(marketRequests)
    .where(and(lte(marketRequests.archiveEligibleAt, now), isNull(marketRequests.archivedAt)));

  for (const record of records) {
    const snapshot = buildArchiveSnapshot("request", record, now);
    const stored = await storagePut(`archives/vouch-market/requests/${record.publicId}.json`, snapshot, "application/json");
    await db
      .update(marketRequests)
      .set({ archivedAt: now, archiveSummary: JSON.stringify({ key: stored.key, url: stored.url, capturedAt: now.toISOString(), status: record.status }) })
      .where(eq(marketRequests.id, record.id));
  }
  return records.length;
}

async function archiveSellerCommitments(now: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const records = await db
    .select()
    .from(sellerCommitments)
    .where(and(lte(sellerCommitments.archiveEligibleAt, now), isNull(sellerCommitments.archivedAt)));

  for (const record of records) {
    const snapshot = buildArchiveSnapshot("seller_commitment", record, now);
    const stored = await storagePut(`archives/vouch-market/seller-commitments/${record.publicId}.json`, snapshot, "application/json");
    await db
      .update(sellerCommitments)
      .set({ archivedAt: now })
      .where(eq(sellerCommitments.id, record.id));
  }
  return records.length;
}

export async function runMarketArchive(now = new Date()) {
  const [requests, sellerCommitments] = await Promise.all([archiveRequests(now), archiveSellerCommitments(now)]);
  return { archivedRequests: requests, archivedSellerCommitments: sellerCommitments, archivedAt: now.toISOString() };
}
