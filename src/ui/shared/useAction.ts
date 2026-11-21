import { useCallback, useRef, useState } from 'react';

export interface ActionState<A extends unknown[], R> {
  run: (...args: A) => Promise<R | undefined>;
  busy: boolean;
  error: unknown;
  clearError: () => void;
}

/** Wraps an async action with busy/error state so components stay declarative. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>): ActionState<A, R> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: A) => {
    setBusy(true);
    setError(null);
    try {
      return await fnRef.current(...args);
    } catch (e) {
      console.error(e);
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy, error, clearError: useCallback(() => setError(null), []) };
}
