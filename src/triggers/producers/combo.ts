// Combo string canonicalisation for keyboard events.
//
// Shared between the legacy document keyboard handler and the new keyboard
// producer to guarantee both pipelines agree on what (e.g.) "mod+shift+z"
// means. Single source of truth.
//
// Conventions:
//   - "mod" stands for meta-or-ctrl (Cmd on macOS, Ctrl elsewhere). We don't
//     distinguish; that would force per-OS keymaps.
//   - Modifier order is mod / shift / alt.
//   - Arrow keys collapse to left / right / up / down.
//   - Space collapses to "space".
//   - Other keys are lowercased verbatim.

export function comboString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey)             parts.push('shift');
  if (e.altKey)               parts.push('alt');
  const key = e.key.toLowerCase();
  const k =
      key === ' '          ? 'space'
    : key === 'arrowleft'  ? 'left'
    : key === 'arrowright' ? 'right'
    : key === 'arrowup'    ? 'up'
    : key === 'arrowdown'  ? 'down'
    :                        key;
  parts.push(k);
  return parts.join('+');
}
