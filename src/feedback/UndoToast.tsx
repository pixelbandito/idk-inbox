import { useEffect, useRef, useState } from 'react';
import { useDispatchContext, useDispatcher, useUndoState } from '../state/useDispatch';

export interface UndoToastProps {
  dismissAfterMs?: number;
}

export function UndoToast({ dismissAfterMs = 6000 }: UndoToastProps) {
  const ctx = useDispatchContext();
  const dispatch = useDispatcher();
  const { undoStack } = useUndoState();

  const top = undoStack[undoStack.length - 1];
  const topKey = top ? `${undoStack.length}:${top.original.action}:${top.original.description}` : null;

  const [dismissed, setDismissed] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When a new entry appears, set a fresh dismissal timer.
  useEffect(() => {
    if (!top || dismissed === topKey) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDismissed(topKey), dismissAfterMs);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [topKey, top, dismissed, dismissAfterMs]);

  if (!top) return null;
  if (dismissed === topKey) return null;

  const onUndo = async () => {
    await dispatch({ action: 'undo', args: {}, context: ctx });
  };

  return (
    <div role="status" aria-live="polite" className="undo-toast">
      <span>{top.original.description}</span>
      <button onClick={() => void onUndo()}>Undo</button>
    </div>
  );
}
