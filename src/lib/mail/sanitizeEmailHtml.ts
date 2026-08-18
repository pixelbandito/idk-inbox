// Sanitise untrusted email HTML for display. DOMPurify strips scripts, event
// handlers, and dangerous tags; we additionally harden links (new tab,
// no-referrer) and, by default, neutralise remote image sources so tracking
// pixels don't phone home just because a message was opened.
//
// Rendered inside a shadow root (see SanitizedEmailBody) so the surviving inline
// styles / <style> blocks can't leak into or out of the app.
//
// Known limitation: only <img> src/srcset are blocked. CSS `background-image:
// url(...)` in inline styles can still reference remote assets; a fuller block
// would strip url() from style attributes. Tracked as a follow-up.

import DOMPurify from 'dompurify';

export interface SanitizeResult {
  html: string;
  /** True when at least one remote image was withheld (offer "show images"). */
  blockedRemoteImages: boolean;
}

const REMOTE = /^(https?:)?\/\//i;

// Interactive / document-level tags that have no place in a rendered message.
const FORBIDDEN = ['script', 'iframe', 'object', 'embed', 'form', 'input',
  'button', 'textarea', 'select', 'link', 'meta', 'base', 'title'];

export function sanitizeEmailHtml(
  raw: string,
  opts: { allowRemoteImages: boolean },
): SanitizeResult {
  let blockedRemoteImages = false;

  const hook = (node: Element) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG' && !opts.allowRemoteImages) {
      const src = node.getAttribute('src') ?? '';
      const srcset = node.getAttribute('srcset') ?? '';
      if (REMOTE.test(src) || srcset) {
        node.removeAttribute('src');
        node.removeAttribute('srcset');
        blockedRemoteImages = true;
      }
    }
  };

  DOMPurify.addHook('afterSanitizeAttributes', hook);
  try {
    const html = DOMPurify.sanitize(raw, {
      FORBID_TAGS: FORBIDDEN,
      FORBID_ATTR: ['ping'],
      ADD_ATTR: ['target'],
      ALLOW_DATA_ATTR: false,
    });
    return { html, blockedRemoteImages };
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}
