import type { AdsApi } from '../api/client';
import type { Campaign } from '../types';
import { useAsync, type AsyncState } from './useAsync';

/** One campaign by id (for the edit page). `data` stays null while loading or when not found. */
export function useCampaign(api: AdsApi, id: string | null, version: number): AsyncState<Campaign | null> {
  const state = useAsync(
    async (signal) => {
      if (!id) return null;
      try {
        return await api.getCampaign(id, signal);
      } catch (err) {
        if ((err as { status?: number })?.status === 404) return null;
        throw err;
      }
    },
    `${id ?? ''}|${version}`,
    { enabled: Boolean(id) },
  );
  // Never show a previously loaded campaign under a different id.
  return { ...state, data: state.data && state.data.id === id ? state.data : null };
}
