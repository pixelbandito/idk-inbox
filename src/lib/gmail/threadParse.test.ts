import { describe, it, expect } from 'vitest';
import { extractPlainText, base64UrlDecode } from './threadParse';

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('base64UrlDecode', () => {
  it('decodes URL-safe base64 (with - and _)', () => {
    const encoded = b64url('Hello, world! +/=');
    expect(base64UrlDecode(encoded)).toBe('Hello, world! +/=');
  });

  it('handles missing padding', () => {
    const encoded = b64url('hi'); // 2-byte input, unpadded
    expect(base64UrlDecode(encoded)).toBe('hi');
  });

  it('returns empty for empty input', () => {
    expect(base64UrlDecode('')).toBe('');
  });
});

describe('extractPlainText', () => {
  it('extracts a top-level text/plain body', () => {
    const payload = {
      mimeType: 'text/plain',
      body: { data: b64url('Hello there') },
    };
    expect(extractPlainText(payload)).toBe('Hello there');
  });

  it('finds text/plain inside multipart', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
        { mimeType: 'text/plain', body: { data: b64url('plain text') } },
      ],
    };
    expect(extractPlainText(payload)).toBe('plain text');
  });

  it('recurses into nested multipart', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('nested plain') } },
          ],
        },
      ],
    };
    expect(extractPlainText(payload)).toBe('nested plain');
  });

  it('falls back to text/html with tags stripped', () => {
    const payload = {
      mimeType: 'text/html',
      body: { data: b64url('<p>hello <b>world</b></p>') },
    };
    expect(extractPlainText(payload)).toBe('hello world');
  });

  it('returns empty string when no body present', () => {
    expect(extractPlainText({ mimeType: 'text/plain' })).toBe('');
    expect(extractPlainText(undefined)).toBe('');
  });
});
