import { useEffect, useState } from 'react';
import { useDispatchContext, useDispatcher, usePending } from '../state/useDispatch';
import { threadSummaryOf } from '../state/threadSummaryCache';
import { eventSnoozeOptionsFor, type EventSnoozeOption } from './eventSnoozeOptions';

interface CustomDateInput {
  value: string;
  /** Parsed wake time, or null when the value is empty, malformed, or past. */
  target: Date | null;
}

const NO_CUSTOM_DATE: CustomDateInput = { value: '', target: null };

/**
 * Coarse lower bound for the datetime-local input, frozen at app load — a
 * browser hint only; real validation happens per keystroke and again in the
 * snooze action.
 */
const MIN_DATETIME_HINT = (() => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
})();

function later(hours: number): string {
  const d = new Date(Date.now() + hours * 3600_000);
  return d.toISOString();
}

function nextMorningAt(hour: number, daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function nextWeekday(targetDay: number, atHour: number): string {
  // 0=Sun..6=Sat
  const d = new Date();
  const days = ((targetDay - d.getDay()) + 7) % 7 || 7;
  d.setDate(d.getDate() + days);
  d.setHours(atHour, 0, 0, 0);
  return d.toISOString();
}

export function SnoozePicker() {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const { pending, setPending } = usePending();
  // target is derived in the change handler (not render) because validity
  // depends on the impure "now".
  const [custom, setCustom] = useState<CustomDateInput>(NO_CUSTOM_DATE);
  const [eventOptions, setEventOptions] = useState<EventSnoozeOption[]>([]);

  const isOpen = ctx.mode === 'picker-snooze' && pending?.action === 'snooze-thread';

  // When snoozing a single thread whose text mentions an upcoming date, offer
  // wake times relative to that event. Computed in an effect: it reads "now".
  useEffect(() => {
    // Microtask keeps the setState out of the effect body itself
    // (react-hooks/set-state-in-effect), matching the panels' pattern.
    queueMicrotask(() => {
      if (!isOpen) {
        setEventOptions([]);
        return;
      }
      const targets = (pending?.args as { targets?: string[] } | undefined)?.targets ?? [];
      setEventOptions(
        targets.length === 1 ? eventSnoozeOptionsFor(threadSummaryOf(targets[0])) : [],
      );
    });
  }, [isOpen, pending]);

  if (!isOpen || !pending) return null;

  const fire = async (until: string) => {
    const targets = (pending.args as { targets?: string[] }).targets ?? [];
    setPending(null);
    setCustom(NO_CUSTOM_DATE);
    await dispatch({ action: 'snooze-thread', args: { targets, until }, context: { ...ctx, mode: 'idle' } });
    await dispatch({ action: 'exit-mode', args: {}, context: ctx });
  };

  const onCustomChange = (value: string) => {
    // datetime-local values are timezone-naive; Date() reads them in the
    // user's local zone, which is what "snooze until Tuesday 9am" means.
    const parsed = new Date(value);
    const isFuture = value !== ''
      && !Number.isNaN(parsed.getTime())
      && parsed.getTime() > Date.now();
    setCustom({ value, target: isFuture ? parsed : null });
  };

  const fireCustom = async () => {
    if (!custom.target) return;
    await fire(custom.target.toISOString());
  };

  const cancel = async () => {
    setPending(null);
    setCustom(NO_CUSTOM_DATE);
    await dispatch({ action: 'exit-mode', args: {}, context: ctx });
  };

  return (
    <div role="dialog" aria-label="Snooze picker" className="snooze-picker" data-surface="overlay">
      <h2>Snooze until…</h2>
      {eventOptions.map((option) => (
        <button key={option.label} onClick={() => void fire(option.until)}>
          {option.label}
        </button>
      ))}
      <button onClick={() => void fire(later(4))}>Later today</button>
      <button onClick={() => void fire(nextMorningAt(9, 1))}>Tomorrow</button>
      <button onClick={() => void fire(nextWeekday(6, 9))}>This weekend</button>
      <button onClick={() => void fire(nextWeekday(1, 9))}>Next week</button>
      <label>
        Pick a date
        <input
          type="datetime-local"
          min={MIN_DATETIME_HINT}
          value={custom.value}
          onChange={(e) => onCustomChange(e.target.value)}
        />
      </label>
      {custom.value !== '' && custom.target === null && (
        <p className="error">Pick a time in the future.</p>
      )}
      <button disabled={custom.target === null} onClick={() => void fireCustom()}>
        {custom.target
          ? `Snooze until ${custom.target.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
          : 'Snooze'}
      </button>
      <button onClick={() => void cancel()}>Cancel</button>
    </div>
  );
}
