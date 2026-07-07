/** "Name <a@b.c>" → "a@b.c"; bare addresses pass through. */
export function senderAddressOf(from: string): string {
  const bracketed = /<([^>]+)>/.exec(from);
  return (bracketed ? bracketed[1] : from).trim().toLowerCase();
}
