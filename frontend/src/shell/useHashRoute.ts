import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TAB, parseRoute, type Route } from './routes';

/**
 * Subscribe to `window.location.hash` and expose it as a parsed route plus a
 * `go(hash)` navigator. An empty hash is normalised to the default tab so the
 * URL is always explicit.
 */
export function useHashRoute(win: Window = window): [Route, (hash: string) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(win.location.hash));

  useEffect(() => {
    if (!win.location.hash) {
      try {
        win.history.replaceState(null, '', DEFAULT_TAB.hash);
      } catch {
        /* history may be unavailable (e.g. file://); parseRoute falls back to the default tab */
      }
    }
    const sync = () => setRoute((prev) => replaceIfChanged(prev, parseRoute(win.location.hash)));
    win.addEventListener('hashchange', sync);
    sync();
    return () => win.removeEventListener('hashchange', sync);
  }, [win]);

  const go = useCallback(
    (hash: string) => {
      if (win.location.hash !== hash) win.location.assign(hash);
      setRoute((prev) => replaceIfChanged(prev, parseRoute(hash)));
    },
    [win],
  );

  return [route, go];
}

/** Keep the previous object when nothing changed, so consumers do not re-render needlessly. */
function replaceIfChanged(prev: Route, next: Route): Route {
  return prev.tab === next.tab && prev.page === next.page && prev.id === next.id ? prev : next;
}
