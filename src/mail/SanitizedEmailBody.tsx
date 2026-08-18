import { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeEmailHtml } from '../lib/mail/sanitizeEmailHtml';

// Scoped inside the shadow root: tame runaway email layouts without letting
// email CSS touch the app (or vice versa). Inherited properties (colour) still
// cross the boundary, so text follows the theme unless the email overrides it.
const SHADOW_RESET = `
  :host { display: block; }
  * { max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere; }
  img { height: auto; }
  a { color: #4a8eff; }
  table { border-collapse: collapse; }
`;

export interface SanitizedEmailBodyProps {
  html: string;
}

/**
 * Renders sanitised email HTML inside a shadow root. Remote images are withheld
 * until the reader opts in, so tracking pixels don't fire on open.
 */
export function SanitizedEmailBody({ html }: SanitizedEmailBodyProps) {
  const [showImages, setShowImages] = useState(false);
  const { html: clean, blockedRemoteImages } = useMemo(
    () => sanitizeEmailHtml(html, { allowRemoteImages: showImages }),
    [html, showImages],
  );

  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    // `clean` is already DOMPurify-sanitised; the shadow root only isolates styles.
    shadow.innerHTML = `<style>${SHADOW_RESET}</style>${clean}`;
  }, [clean]);

  return (
    <div className="email-html">
      {blockedRemoteImages && !showImages && (
        <button className="email-html__show-images" onClick={() => setShowImages(true)}>
          Show images
        </button>
      )}
      <div ref={hostRef} className="email-html__body" />
    </div>
  );
}
