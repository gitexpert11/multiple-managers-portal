import { useSyncExternalStore } from 'react';

/** The minimal contract every app store fulfils: a snapshot getter plus change subscription. */
export interface ReadableStore<S> {
  getState(): S;
  subscribe(listener: (state: S) => void): () => void;
}

/**
 * Bind an external store to React. The stores are plain objects (framework
 * agnostic, fully unit-testable) and publish immutable snapshots, which is
 * exactly what `useSyncExternalStore` needs.
 */
export function useStore<S>(store: ReadableStore<S>): S {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
    () => store.getState(),
  );
}
