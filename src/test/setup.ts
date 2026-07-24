// Global test setup: registers jest-dom matchers for all Vitest runs.
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// The suite runs many files in parallel on slow/contended machines, where a
// render + dispatch that normally takes ~50ms can spike past waitFor's 1000ms
// default and fail spuriously. Give async assertions generous headroom — this
// costs passing tests nothing (waitFor resolves as soon as its condition holds;
// the timeout only bounds how long a genuine failure takes to report).
configure({ asyncUtilTimeout: 5000 });

// jsdom does not implement scrollIntoView. LayoutContainer calls it inside an
// effect when focusIndex changes, so provide a no-op stub for all tests.
// Individual tests can still override this to assert calls.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
