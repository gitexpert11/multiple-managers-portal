import type { AdsApi, CampaignListQuery } from '../api/client';
import type { CampaignPage, DashboardSeries, DashboardSummary } from '../types';
import { useAsync, type AsyncState } from './useAsync';

export interface DashboardData {
  summary: DashboardSummary;
  series: DashboardSeries;
  campaigns: CampaignPage;
}

/**
 * Everything the dashboard shows for one query: headline totals (with the
 * previous period), the daily series and the current grid page. The three
 * requests run in parallel and are refreshed together after every mutation.
 */
export function useDashboard(api: AdsApi, query: CampaignListQuery, version: number): AsyncState<DashboardData> {
  return useAsync(
    async (signal) => {
      const [summary, series, campaigns] = await Promise.all([api.getSummary(query, signal), api.getSeries(query, signal), api.listCampaigns(query, signal)]);
      return { summary, series, campaigns };
    },
    `${JSON.stringify(query)}|${version}`,
  );
}
