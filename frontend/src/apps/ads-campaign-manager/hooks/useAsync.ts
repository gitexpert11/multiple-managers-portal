import { useCallback, useEffect, useEffectEvent, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** Re-run the loader (e.g. after a mutation or to retry). */
  refresh: () => void;
}

interface Result<T> {
  /** The request key this result answers; `loading` is simply "the key changed since". */
  key: string;
  data: T | null;
  error: Error | null;
}

/**
 * Run an abortable async loader whenever `requestKey` changes (callers build
 * the key from everything the request depends on). The previous result is
 * kept while the next one loads (so the UI does not flash empty), stale
 * responses are dropped, and in-flight requests are aborted on change/unmount.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, requestKey: string, { enabled = true }: { enabled?: boolean } = {}): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<Result<T>>({ key: '', data: null, error: null });
  const key = `${requestKey}|${tick}`;
  // Always call the latest loader without making it an effect dependency.
  const load = useEffectEvent((signal: AbortSignal) => loader(signal));

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    load(controller.signal)
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error)?.name === 'AbortError') return;
        setResult((prev) => ({ key, data: prev.data, error: err instanceof Error ? err : new Error(String(err)) }));
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, enabled]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data: result.data, loading: enabled && result.key !== key, error: result.key === key ? result.error : null, refresh };
}
