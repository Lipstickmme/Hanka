export function excludeArchivedRecords<T extends { archivedAt: Date | null }>(records: T[]) {
  return records.filter(record => record.archivedAt === null);
}

export function removeArchiveMetadata<T extends { archivedAt: Date | null }>(records: T[]) {
  return excludeArchivedRecords(records).map(({ archivedAt: _archivedAt, ...record }) => record);
}
