// List-Unsubscribe (RFC 2369) parsing. One-click POST (RFC 8058) is not
// attempted — cross-origin POSTs from the browser die on CORS — so the flow
// is: open the sender's page (or a mailto:) and let the user finish there.

const URI_IN_BRACKETS = /<([^>]+)>/g;

/** Best URI from a raw List-Unsubscribe header: https first, else mailto. */
export function unsubscribeUriOf(header: string): string | null {
  const uris = [...header.matchAll(URI_IN_BRACKETS)].map((m) => m[1].trim());
  return (
    uris.find((u) => u.startsWith('https://')) ??
    uris.find((u) => u.startsWith('mailto:')) ??
    null
  );
}
