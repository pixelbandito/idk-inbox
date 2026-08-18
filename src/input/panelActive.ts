// Whether an element sits inside the currently-active panel. In-panel gesture-
// ish events (row swipes, overscroll-to-close, pull-to-refresh) consult this so
// they only act on the active panel — a gesture on an inactive one merely
// activates it (handled by the layout), it doesn't mutate its contents.
//
// Read at GESTURE START: the layout activates a panel on pointer-down, but that
// re-render lands after the event, so `data-active` still reflects the
// pre-activation state during the opening event — exactly what we want to gate
// on ("was this panel already active when I started?").

export function isPanelActive(el: Element | null | undefined): boolean {
  const panel = el?.closest('.panel');
  // Allowed unless we're inside a panel that is explicitly NOT active. (No
  // panel context — e.g. an isolated unit test — is treated as active.)
  return !panel || panel.getAttribute('data-active') === 'true';
}
