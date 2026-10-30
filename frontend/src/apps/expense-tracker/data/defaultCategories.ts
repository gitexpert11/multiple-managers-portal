import type { Category } from '../types';

/**
 * Seed categories. Ids are stable strings so user data stays linked to them
 * across app versions; names/colours can change freely.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  // Expenses
  { id: 'cat_food', name: 'Food & Dining', type: 'expense', color: '#f97316', builtIn: true },
  { id: 'cat_groceries', name: 'Groceries', type: 'expense', color: '#84cc16', builtIn: true },
  { id: 'cat_transport', name: 'Transport', type: 'expense', color: '#0ea5e9', builtIn: true },
  { id: 'cat_housing', name: 'Housing & Rent', type: 'expense', color: '#8b5cf6', builtIn: true },
  { id: 'cat_utilities', name: 'Utilities', type: 'expense', color: '#14b8a6', builtIn: true },
  { id: 'cat_health', name: 'Health', type: 'expense', color: '#ef4444', builtIn: true },
  { id: 'cat_entertainment', name: 'Entertainment', type: 'expense', color: '#ec4899', builtIn: true },
  { id: 'cat_shopping', name: 'Shopping', type: 'expense', color: '#eab308', builtIn: true },
  { id: 'cat_education', name: 'Education', type: 'expense', color: '#6366f1', builtIn: true },
  { id: 'cat_other_expense', name: 'Other', type: 'expense', color: '#9ca3af', builtIn: true },
  // Income
  { id: 'cat_salary', name: 'Salary', type: 'income', color: '#22c55e', builtIn: true },
  { id: 'cat_freelance', name: 'Freelance', type: 'income', color: '#10b981', builtIn: true },
  { id: 'cat_investments', name: 'Investments', type: 'income', color: '#06b6d4', builtIn: true },
  { id: 'cat_gifts', name: 'Gifts', type: 'income', color: '#a855f7', builtIn: true },
  { id: 'cat_other_income', name: 'Other Income', type: 'income', color: '#64748b', builtIn: true },
];

/** Palette used for user-created categories, cycled in order. */
export const CATEGORY_PALETTE = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#a3e635'];
