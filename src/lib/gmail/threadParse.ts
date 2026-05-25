export function base64UrlDecode(s: string): string {
  if (!s) return '';
  // Convert URL-safe alphabet back to standard base64.
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to a multiple of 4.
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  // atob → binary string → decode as UTF-8.
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

function findPart(
  part: MessagePart | undefined,
  predicate: (p: MessagePart) => boolean,
): MessagePart | null {
  if (!part) return null;
  if (predicate(part)) return part;
  for (const sub of part.parts ?? []) {
    const found = findPart(sub, predicate);
    if (found) return found;
  }
  return null;
}

function stripTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

export function extractPlainText(payload: MessagePart | undefined): string {
  const plain = findPart(payload, (p) => p.mimeType === 'text/plain' && !!p.body?.data);
  if (plain) return base64UrlDecode(plain.body!.data!);

  const html = findPart(payload, (p) => p.mimeType === 'text/html' && !!p.body?.data);
  if (html) return stripTags(base64UrlDecode(html.body!.data!));

  return '';
}
