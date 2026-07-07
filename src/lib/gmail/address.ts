/** "Name <a@b.c>" → "a@b.c"; bare addresses pass through. */
export function senderAddressOf(from: string): string {
  const bracketed = /<([^>]+)>/.exec(from);
  return (bracketed ? bracketed[1] : from).trim().toLowerCase();
}

/**
 * Strict shape check for addresses we interpolate into Gmail search queries.
 * From headers are attacker-controlled; a quote inside one would break out of
 * `from:"..."` and widen the query (Gmail has no in-query escaping, so
 * allow-listing at the boundary is the defense).
 */
export function isPlainEmailAddress(address: string): boolean {
  return /^[^\s"'()<>@,;:\\]+@[^\s"'()<>@,;:\\]+$/.test(address);
}
