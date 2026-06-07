// fromKeyboard — translates document-level keydown events into AbstractEvent
// keypress records on the 'document' surface.
//
// Important: this hook attaches its OWN document keydown listener. It does
// NOT wrap useDocumentKeyboard. During Step 2 the legacy handler still runs;
// wrapping it would double-fire actions. The shared comboString util (see
// ./combo) keeps both pipelines agreeing on combo names.

import { useEffect, useLayoutEffect, useRef } from 'react';
import { comboString } from './combo';
import type { AbstractEvent } from '../types';

export function useKeyboardProducer(
  onEvent: (e: AbstractEvent) => void,
): void {
  // Keep onEvent in a ref so the listener-attachment effect doesn't churn on
  // every re-render — only re-attaches when the document changes (never).
  // The ref write happens in a layout effect (not during render) to satisfy
  // react-hooks/refs.
  const onEventRef = useRef(onEvent);
  useLayoutEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      onEventRef.current({
        kind:    'keypress',
        surface: 'document',
        combo:   comboString(e),
      });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
