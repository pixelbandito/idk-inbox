import { gestureGroups, KEYBOARD_SHORTCUTS } from './shortcutBindings';

/**
 * A read-only reference for the current gesture and keyboard bindings. Editing
 * these is a planned next step; for now the goal is that users can SEE what the
 * app will do in response to a swipe or a keypress.
 */
export function ShortcutsReference() {
  return (
    <div className="shortcuts">
      <h4 className="shortcuts__group-title">Row swipes</h4>
      {gestureGroups().map((group) => (
        <div key={group.heading} className="shortcuts__gesture-group">
          {group.rows.map((row) => (
            <div key={row.action} className="shortcuts__row">
              <span className="shortcuts__keys">{row.distance}</span>
              <span className="shortcuts__action">{row.action}</span>
            </div>
          ))}
        </div>
      ))}

      <h4 className="shortcuts__group-title">Keyboard</h4>
      {KEYBOARD_SHORTCUTS.map((row) => (
        <div key={row.keys} className="shortcuts__row">
          <kbd className="shortcuts__keys">{row.keys}</kbd>
          <span className="shortcuts__action">{row.action}</span>
        </div>
      ))}

      <p className="shortcuts__note">
        Custom mappings are coming — for now these are the built-in bindings.
      </p>
    </div>
  );
}
