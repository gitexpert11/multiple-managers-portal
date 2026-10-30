export type TxType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string;
  builtIn: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  /** Integer cents. */
  amount: number;
  /** "YYYY-MM-DD" */
  date: string;
  categoryId: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionInput {
  type: TxType;
  amount: number;
  date: string;
  categoryId?: string;
  description?: string;
}

export type GridSortKey = 'date' | 'amount' | 'category' | 'description';
export type SortDir = 'asc' | 'desc';

export interface GridSort {
  key: GridSortKey;
  dir: SortDir;
}

export interface Preferences {
  currency: string;
  locale: string;
  /** Legacy: the theme now lives at workspace level; kept so old data still loads. */
  theme: 'system' | 'light' | 'dark';
  lastCategory: Record<TxType, string>;
  gridSort: GridSort;
}

export interface ExpenseState {
  transactions: Transaction[];
  categories: Category[];
  preferences: Preferences;
}
