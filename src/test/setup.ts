// Global test setup: registers jest-dom matchers for all Vitest runs.
import '@testing-library/jest-dom';

// jsdom does not implement scrollIntoView. LayoutContainer calls it inside an
// effect when focusIndex changes, so provide a no-op stub for all tests.
// Individual tests can still override this to assert calls.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
