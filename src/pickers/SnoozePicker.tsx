import { useDispatchContext, useDispatcher, usePending } from '../state/useDispatch';

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

  if (ctx.mode !== 'picker-snooze' || pending?.action !== 'snooze-thread') return null;

  const fire = async (until: string) => {
    const targets = (pending.args as { targets?: string[] }).targets ?? [];
    setPending(null);
    await dispatch({ action: 'snooze-thread', args: { targets, until }, context: { ...ctx, mode: 'idle' } });
    await dispatch({ action: 'exit-mode', args: {}, context: ctx });
  };

  const cancel = async () => {
    setPending(null);
    await dispatch({ action: 'exit-mode', args: {}, context: ctx });
  };

  return (
    <div role="dialog" aria-label="Snooze picker" className="snooze-picker">
      <h2>Snooze until…</h2>
      <button onClick={() => void fire(later(4))}>Later today</button>
      <button onClick={() => void fire(nextMorningAt(9, 1))}>Tomorrow</button>
      <button onClick={() => void fire(nextWeekday(6, 9))}>This weekend</button>
      <button onClick={() => void fire(nextWeekday(1, 9))}>Next week</button>
      <button onClick={() => void fire('2099-01-01T00:00:00Z')}>Custom (placeholder)</button>
      <button onClick={() => void cancel()}>Cancel</button>
    </div>
  );
}
