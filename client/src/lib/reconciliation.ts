export type ReconciliationRecord = {
  sourceHandle?: string | null;
  profileHandle?: string | null;
  targetHandle?: string | null;
};

export function accountPairLabel(record: ReconciliationRecord) {
  const source = record.sourceHandle ?? record.profileHandle;
  return source && record.targetHandle ? `@${source} → @${record.targetHandle}` : source ? `Source @${source}` : record.targetHandle ? `Target @${record.targetHandle}` : "Account pair pending";
}
