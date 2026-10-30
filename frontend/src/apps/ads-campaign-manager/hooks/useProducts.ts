import type { AdsApi } from '../api/client';
import type { ProductList } from '../types';
import { useAsync, type AsyncState } from './useAsync';

/** The whole catalogue (a few dozen products), loaded when the picker first opens and searched client-side. */
export function useProducts(api: AdsApi, enabled: boolean): AsyncState<ProductList> {
  return useAsync((signal) => api.listProducts(undefined, signal), 'catalogue', { enabled });
}
