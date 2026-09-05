export function walletsMatch(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}
