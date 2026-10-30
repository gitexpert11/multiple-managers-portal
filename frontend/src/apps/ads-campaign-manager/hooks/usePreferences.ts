import { useCallback, useEffect, useState } from 'react';
import type { AdsApi } from '../api/client';
import { DEFAULT_CURRENCY, isCurrency } from '../lib/money';
import type { Preferences } from '../types';

/** Display preferences, loaded once and updated optimistically. */
export function usePreferences(api: AdsApi): [Preferences, (patch: Partial<Preferences>) => Promise<Preferences>] {
  const [prefs, setPrefs] = useState<Preferences>({ currency: DEFAULT_CURRENCY });

  useEffect(() => {
    const controller = new AbortController();
    api
      .getPreferences(controller.signal)
      .then((loaded) => setPrefs({ currency: isCurrency(loaded.currency) ? loaded.currency : DEFAULT_CURRENCY }))
      .catch(() => {
        /* keep the default; the dashboard surfaces connectivity errors */
      });
    return () => controller.abort();
  }, [api]);

  const update = useCallback(
    async (patch: Partial<Preferences>) => {
      const previous = prefs;
      setPrefs((p) => ({ ...p, ...patch }));
      try {
        const saved = await api.updatePreferences(patch);
        setPrefs(saved);
        return saved;
      } catch (err) {
        setPrefs(previous);
        throw err;
      }
    },
    [api, prefs],
  );

  return [prefs, update];
}
