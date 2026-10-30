import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@shared/ui/Icon';
import { defaultDateForMonth } from '../lib/dates';
import { centsToInput, parseAmount } from '../lib/money';
import type { Category, Transaction, TransactionInput, TxType } from '../types';

const NEW_CATEGORY = '__new__';

export interface TransactionFormHandle {
  focusAmount(): void;
}

interface TransactionFormProps {
  categories: Category[];
  month: string;
  lastCategory: Record<TxType, string>;
  editing: Transaction | null;
  currencySymbol: string;
  maxDate: string;
  now: () => Date;
  onSubmit: (payload: TransactionInput, editingId: string | null) => boolean;
  onCancelEdit: () => void;
  onAddCategory: (name: string, type: TxType) => Category | null;
}

/**
 * Add / edit form.
 *
 * Optimised for speed: the amount field is focused, type + category + date are
 * pre-filled from context (last used category, selected month), and Enter
 * submits from any field. The quickest path is "type amount, press Enter".
 */
export const TransactionForm = forwardRef<TransactionFormHandle, TransactionFormProps>(function TransactionForm(
  { categories, month, lastCategory, editing, currencySymbol, maxDate, now, onSubmit, onCancelEdit, onAddCategory },
  ref,
) {
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => defaultDateForMonth(month, now()));
  const [dateTouched, setDateTouched] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(lastCategory.expense);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [amountError, setAmountError] = useState('');
  const [dateError, setDateError] = useState('');

  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const newCategoryRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const editingId = editing?.id ?? null;

  useImperativeHandle(ref, () => ({ focusAmount: () => amountRef.current?.focus() }), []);

  const ofType = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  // Enter / leave edit mode when the parent hands us a transaction (or takes it away).
  const prevEditingId = useRef<string | null>(null);
  useEffect(() => {
    if (editing && editing.id !== prevEditingId.current) {
      setType(editing.type);
      setAmount(centsToInput(editing.amount));
      setDescription(editing.description || '');
      setDate(editing.date);
      setDateTouched(true);
      setCategoryId(editing.categoryId);
      setAmountError('');
      setDateError('');
      setNewCategoryOpen(false);
      amountRef.current?.focus();
      amountRef.current?.select();
    } else if (!editing && prevEditingId.current) {
      setAmount('');
      setDescription('');
      setDateTouched(false);
      setDate(defaultDateForMonth(month, now()));
      setAmountError('');
      setDateError('');
    }
    prevEditingId.current = editing?.id ?? null;
  }, [editing, month, now]);

  // Follow the selected month until the user picks a date themselves.
  const prevMonth = useRef(month);
  useEffect(() => {
    if (editingId) return;
    if (month !== prevMonth.current || !date) {
      if (!dateTouched || month !== prevMonth.current) {
        setDate(defaultDateForMonth(month, now()));
        setDateTouched(false);
      }
    }
    prevMonth.current = month;
  }, [month, editingId, dateTouched, date, now]);

  // Keep the category valid for the current type (and follow "last used" when not editing).
  useEffect(() => {
    if (categoryId === NEW_CATEGORY) return;
    if (ofType.some((c) => c.id === categoryId)) return;
    const preferred = !editingId && ofType.some((c) => c.id === lastCategory[type]) ? lastCategory[type] : (ofType[0]?.id ?? '');
    setCategoryId(preferred);
  }, [type, categories, lastCategory, categoryId, ofType, editingId]);

  function switchType(next: TxType) {
    setType(next);
    if (!editingId) setCategoryId(lastCategory[next]);
  }

  function onCategoryChange(value: string) {
    if (value === NEW_CATEGORY) {
      setNewCategoryOpen(true);
      setNewCategoryName('');
      setTimeout(() => newCategoryRef.current?.focus(), 0);
    } else {
      setCategoryId(value);
    }
  }

  function commitNewCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      newCategoryRef.current?.focus();
      return;
    }
    const created = onAddCategory(name, type);
    setNewCategoryOpen(false);
    if (created) setCategoryId(created.id);
    (amount ? descriptionRef : amountRef).current?.focus();
  }

  function cancelNewCategory() {
    setNewCategoryOpen(false);
    categoryRef.current?.focus();
  }

  function onNewCategoryKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commitNewCategory();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelNewCategory();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newCategoryOpen) {
      commitNewCategory();
      return;
    }
    const cents = parseAmount(amount);
    if (cents == null) {
      setAmountError('Enter a positive amount, e.g. 12.50');
      amountRef.current?.focus();
      amountRef.current?.select();
      return;
    }
    setAmountError('');
    let when = date;
    if (!when) when = defaultDateForMonth(month, now());
    // Day keys are zero-padded ISO strings, so string comparison is chronological.
    if (maxDate && when > maxDate) {
      setDateError('Date cannot be in the future');
      return;
    }
    setDateError('');
    const ok = onSubmit({ type, amount: cents, categoryId: categoryId === NEW_CATEGORY ? '' : categoryId, description, date: when }, editingId);
    if (!ok) return;
    if (!editingId) {
      setAmount('');
      setDescription('');
      amountRef.current?.focus();
    }
  }

  const submitLabel = editingId ? 'Save changes' : type === 'expense' ? 'Add expense' : 'Add income';

  return (
    <section className={`panel tx-panel${editingId ? ' tx-panel--editing' : ''}`} data-type={type}>
      <h2 className="panel__title" id="tx-form-heading">
        {editingId ? 'Edit transaction' : 'Add transaction'}
      </h2>
      <form className="tx-form" noValidate onSubmit={handleSubmit} aria-labelledby="tx-form-heading">
        <div className="segmented" role="radiogroup" aria-label="Transaction type">
          <input type="radio" name="tx-type" id="tx-type-expense" value="expense" className="segmented__input" checked={type === 'expense'} onChange={() => switchType('expense')} />
          <label htmlFor="tx-type-expense" className="segmented__label segmented__label--expense">
            Expense
          </label>
          <input type="radio" name="tx-type" id="tx-type-income" value="income" className="segmented__input" checked={type === 'income'} onChange={() => switchType('income')} />
          <label htmlFor="tx-type-income" className="segmented__label segmented__label--income">
            Income
          </label>
        </div>

        <div className={`field${amountError ? ' field--invalid' : ''}`}>
          <label className="field__label" htmlFor="tx-amount">
            Amount
          </label>
          <div className="field__wrap">
            <span className="field__prefix" aria-hidden="true">
              {currencySymbol}
            </span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              id="tx-amount"
              className="field__input field__input--amount"
              placeholder="0.00"
              autoComplete="off"
              required
              aria-describedby="tx-amount-error"
              aria-invalid={amountError ? 'true' : 'false'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <p className="field__error" id="tx-amount-error" role="alert">
            {amountError}
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="tx-category">
            Category
          </label>
          <select ref={categoryRef} id="tx-category" className="field__input" value={newCategoryOpen ? NEW_CATEGORY : categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
            {ofType.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ New category…</option>
          </select>
          <div className="field__inline" hidden={!newCategoryOpen}>
            <input
              ref={newCategoryRef}
              type="text"
              className="field__input"
              placeholder="New category name"
              aria-label="New category name"
              maxLength={40}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={onNewCategoryKey}
            />
            <button type="button" className="btn btn--sm" onClick={commitNewCategory}>
              Add
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={cancelNewCategory}>
              Cancel
            </button>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="tx-description">
            Description
          </label>
          <input
            ref={descriptionRef}
            type="text"
            id="tx-description"
            className="field__input"
            placeholder="What was it for? (optional)"
            maxLength={200}
            autoComplete="off"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={`field${dateError ? ' field--invalid' : ''}`}>
          <label className="field__label" htmlFor="tx-date">
            Date
          </label>
          <input
            type="date"
            id="tx-date"
            className="field__input"
            required
            max={maxDate || undefined}
            aria-describedby="tx-date-error"
            aria-invalid={dateError ? 'true' : 'false'}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDateTouched(true);
            }}
          />
          <p className="field__error" id="tx-date-error" role="alert">
            {dateError}
          </p>
        </div>

        <div className="tx-form__actions">
          <button type="submit" className="btn btn--primary">
            {!editingId && <Icon name="plus" size={16} />}
            <span>{submitLabel}</span>
          </button>
          <button type="button" className="btn btn--ghost" hidden={!editingId} onClick={onCancelEdit}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
});
