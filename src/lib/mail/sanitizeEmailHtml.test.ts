import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from './sanitizeEmailHtml';

const clean = (raw: string, allowRemoteImages = false) => sanitizeEmailHtml(raw, { allowRemoteImages });

describe('sanitizeEmailHtml', () => {
  it('strips scripts and event handlers, keeps safe formatting', () => {
    const r = clean('<p>Hi <b>there</b></p><script>alert(1)</script><img onerror="alert(2)" src="x">');
    expect(r.html).toContain('<b>there</b>');
    expect(r.html).not.toContain('<script');
    expect(r.html).not.toContain('onerror');
  });

  it('drops dangerous / document-level tags', () => {
    const r = clean('<iframe src="evil"></iframe><form><input></form><p>ok</p>');
    expect(r.html).not.toContain('<iframe');
    expect(r.html).not.toContain('<form');
    expect(r.html).not.toContain('<input');
    expect(r.html).toContain('ok');
  });

  it('hardens links to open safely in a new tab', () => {
    const r = clean('<a href="https://example.com">link</a>');
    expect(r.html).toContain('target="_blank"');
    expect(r.html).toContain('rel="noopener noreferrer"');
  });

  it('withholds remote image sources by default and reports it', () => {
    const r = clean('<img src="https://tracker.example.com/pixel.gif?u=1">');
    expect(r.blockedRemoteImages).toBe(true);
    expect(r.html).not.toContain('tracker.example.com');
    expect(r.html).not.toContain('src=');
  });

  it('also withholds srcset images', () => {
    const r = clean('<img srcset="https://t.example.com/a.png 1x">');
    expect(r.blockedRemoteImages).toBe(true);
    expect(r.html).not.toContain('srcset');
  });

  it('keeps images when remote images are allowed', () => {
    const r = clean('<img src="https://cdn.example.com/logo.png">', true);
    expect(r.blockedRemoteImages).toBe(false);
    expect(r.html).toContain('https://cdn.example.com/logo.png');
  });

  it('leaves inline (data:) images and non-image content alone when blocking', () => {
    const r = clean('<p>text</p><img src="data:image/png;base64,AAAA">');
    expect(r.blockedRemoteImages).toBe(false);
    expect(r.html).toContain('data:image/png');
  });
});
