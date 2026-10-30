import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@shared/ui/Icon';
import type { AdsApi } from '../api/client';
import { BID_STRATEGIES, DEFAULT_BID_STRATEGY } from '../data/bidStrategies';
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, DEFAULT_CAMPAIGN_TYPE, DEFAULT_STATUS, getCampaignType } from '../data/campaignTypes';
import { MAX_DAILY_BUDGET, MIN_DAILY_BUDGET, NAME_MAX } from '../data/limits';
import { dayKeyOfTimestamp, formatDay, isValidDayKey } from '../lib/dates';
import { centsToInput, currencySymbol, formatMoney, parseAmount } from '../lib/money';
import { DEFAULT_PAGE_SIZE, isPageSize, pageAfterResize, paginate } from '../lib/pagination';
import type { BidStrategyId, Campaign, CampaignCreate, CampaignTypeId, CampaignUpdate, ProductSnapshot, StatusId } from '../types';
import { Pager } from './Pager';
import { initials, ProductPicker } from './ProductPicker';

export interface CampaignFormHandle {
  focus(): void;
}

export type CampaignFormPayload = CampaignCreate & { status?: StatusId };

interface CampaignFormProps {
  api: AdsApi;
  mode: 'create' | 'edit';
  /** Edit mode: the campaign being edited. Key the form by the record so it resets when it changes. */
  campaign?: Campaign | null;
  today: string;
  currency: string;
  /** Resolve to `true` to reset the form (create) or re-baseline it (edit). */
  onSubmit: (payload: CampaignFormPayload) => Promise<boolean> | boolean;
  onCancel: () => void;
}

const COPY = {
  create: { heading: 'Create campaign', hint: 'The campaign starts today and appears on your dashboard as soon as it is submitted.', submit: 'Submit campaign', submitIcon: 'megaphone', testid: 'ads-create', prefix: 'campaign', addProducts: 'ads-add-products', submitId: 'ads-campaign-submit', cancelId: 'ads-campaign-cancel', productsId: 'ads-products' },
  edit: { heading: 'Edit campaign', hint: 'Changes apply as soon as you save. Performance history is kept.', submit: 'Save changes', submitIcon: 'check', testid: 'ads-edit', prefix: 'edit-campaign', addProducts: 'ads-edit-add-products', submitId: 'ads-edit-submit', cancelId: 'ads-edit-cancel', productsId: 'ads-edit-products' },
} as const;

interface FormState {
  name: string;
  budget: string;
  endDate: string;
  type: CampaignTypeId;
  bid: BidStrategyId;
  status: StatusId;
  products: ProductSnapshot[];
}

const snapshotProducts = (list: ProductSnapshot[]) => list.map(({ id, sku, name, category, price }) => ({ id, sku, name, category, price }));

function stateFromCampaign(c: Campaign | null | undefined): FormState {
  if (!c) return { name: '', budget: '', endDate: '', type: DEFAULT_CAMPAIGN_TYPE, bid: DEFAULT_BID_STRATEGY, status: DEFAULT_STATUS, products: [] };
  return { name: c.name, budget: centsToInput(c.dailyBudget), endDate: c.endDate || '', type: c.type, bid: c.bidStrategy, status: c.status, products: snapshotProducts(c.products) };
}

/** What would be submitted right now (raw budget text parsed; null when unparsable). */
function payloadOf(state: FormState, isEdit: boolean) {
  const payload: Record<string, unknown> = { name: state.name.trim(), dailyBudget: parseAmount(state.budget), endDate: state.endDate || null, type: state.type, bidStrategy: state.bid, products: snapshotProducts(state.products) };
  if (isEdit) payload.status = state.status;
  return payload;
}

/**
 * Campaign form, used for both the "Create campaign" page (`mode: 'create'`)
 * and the "Edit campaign" page (`mode: 'edit'`).
 *
 * Fields: name, daily budget, optional end date, campaign type, products (via
 * the picker dialog, listed in a paged grid once added) and bid strategy (auto
 * only for now). In edit mode the type is locked, a status switch is added,
 * and "Save changes" is enabled only once something differs from the loaded
 * campaign. Validation is inline with focus on the first invalid field.
 */
export const CampaignForm = forwardRef<CampaignFormHandle, CampaignFormProps>(function CampaignForm({ api, mode, campaign = null, today, currency, onSubmit, onCancel }, ref) {
  const copy = COPY[mode];
  const isEdit = mode === 'edit';
  const id = (suffix: string) => `${copy.prefix}-${suffix}`;

  const [state, setState] = useState<FormState>(() => stateFromCampaign(campaign));
  const [errors, setErrors] = useState<{ name?: string; budget?: string; endDate?: string; products?: string }>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const budgetRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const addProductsRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(ref, () => ({ focus: () => nameRef.current?.focus() }), []);

  // Edit mode: the baseline for dirty checks. (The parent keys this form by
  // campaign id + updatedAt, so a different record remounts it with fresh state.)
  const baseline = useMemo(() => (isEdit && campaign ? JSON.stringify(payloadOf(stateFromCampaign(campaign), true)) : null), [isEdit, campaign]);

  const money = (cents: number) => formatMoney(cents, { currency });
  const symbol = currencySymbol(currency);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }));
  /** The earliest allowed end date: the campaign's start (edit) or today (create). */
  const earliestEnd = isEdit && campaign ? campaign.startDate : today;
  const dirty = !isEdit || (baseline != null && JSON.stringify(payloadOf(state, true)) !== baseline);

  function setProducts(next: ProductSnapshot[]) {
    set('products', next);
    if (next.length) setErrors((e) => ({ ...e, products: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || (isEdit && !dirty)) return;
    const next: typeof errors = {};
    let firstInvalid: HTMLElement | null = null;

    const name = state.name.trim();
    if (!name) {
      next.name = 'Give the campaign a name';
      firstInvalid = nameRef.current;
    }
    const dailyBudget = parseAmount(state.budget);
    if (dailyBudget == null) next.budget = 'Enter a daily budget';
    else if (dailyBudget < MIN_DAILY_BUDGET) next.budget = `Daily budget must be at least ${money(MIN_DAILY_BUDGET)}`;
    else if (dailyBudget > MAX_DAILY_BUDGET) next.budget = `Daily budget cannot exceed ${money(MAX_DAILY_BUDGET)}`;
    if (next.budget) firstInvalid ??= budgetRef.current;

    const endDate = state.endDate || null;
    if (endDate && !isValidDayKey(endDate)) next.endDate = 'Enter a valid end date';
    else if (endDate && earliestEnd && endDate < earliestEnd) next.endDate = isEdit ? 'End date cannot be before the start date' : 'End date cannot be in the past';
    if (next.endDate) firstInvalid ??= endRef.current;

    if (!state.products.length) {
      next.products = 'Add at least one product';
      firstInvalid ??= addProductsRef.current;
    }

    setErrors(next);
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const payload: CampaignFormPayload = { name, dailyBudget: dailyBudget as number, endDate, type: state.type, bidStrategy: state.bid, products: snapshotProducts(state.products) };
    if (isEdit) payload.status = state.status;
    setSubmitting(true);
    try {
      const ok = await onSubmit(payload);
      if (ok !== false && !isEdit) {
        setState(stateFromCampaign(null));
        setErrors({});
        setProductPage(1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const paged = paginate(state.products, productPage, productPageSize);
  const n = state.products.length;
  const typeDef = campaign ? getCampaignType(campaign.type) : null;

  return (
    <section className="ads-panel ads-form-panel" data-testid={copy.testid}>
      <div className="ads-panel__head">
        <div>
          <h2 className="ads-panel__title" id={id('heading')}>
            {copy.heading}
          </h2>
          <p className="ads-panel__hint">{copy.hint}</p>
        </div>
      </div>
      <form className="ads-form" noValidate onSubmit={handleSubmit} aria-labelledby={id('heading')}>
        {isEdit && campaign && (
          <dl className="ads-facts" data-testid="ads-edit-facts">
            <Fact label="Type">
              <span className="ads-type-pill" style={{ '--type-color': typeDef?.color || '#9ca3af' } as React.CSSProperties}>
                <Icon name={typeDef?.icon || 'tag'} size={12} />
                {typeDef?.label || campaign.type}
              </span>
            </Fact>
            <Fact label="Started">{formatDay(campaign.startDate)}</Fact>
            <Fact label="Ends">{campaign.endDate ? formatDay(campaign.endDate) : 'No end date'}</Fact>
            <Fact label="Days with data">{String(campaign.performanceDays)}</Fact>
            <Fact label="Last updated">{formatDay(dayKeyOfTimestamp(campaign.updatedAt))}</Fact>
          </dl>
        )}

        <div className="ads-form__grid ads-form__grid--3">
          <Field label="Campaign name" htmlFor={id('name')} error={errors.name} errorId={id('name-error')}>
            <input
              ref={nameRef}
              type="text"
              id={id('name')}
              className="ads-field__input"
              placeholder="e.g. Spring Sale — Headphones"
              maxLength={NAME_MAX}
              autoComplete="off"
              required
              aria-describedby={id('name-error')}
              aria-invalid={errors.name ? 'true' : 'false'}
              value={state.name}
              onChange={(e) => {
                set('name', e.target.value);
                if (e.target.value.trim()) setErrors((er) => ({ ...er, name: undefined }));
              }}
            />
          </Field>
          <Field label="Daily budget" htmlFor={id('budget')} error={errors.budget} errorId={id('budget-error')} hint={`Spent per day at most. Minimum ${money(MIN_DAILY_BUDGET)}.`} hintId={id('budget-hint')}>
            <div className="ads-money">
              <span className={`ads-money__prefix${symbol.length > 1 ? ' ads-money__prefix--wide' : ''}`} aria-hidden="true">
                {symbol}
              </span>
              <input
                ref={budgetRef}
                type="text"
                id={id('budget')}
                className={`ads-field__input ads-field__input--money${symbol.length > 1 ? ' ads-field__input--money-wide' : ''}`}
                inputMode="decimal"
                placeholder="25.00"
                autoComplete="off"
                required
                aria-describedby={`${id('budget-error')} ${id('budget-hint')}`}
                aria-invalid={errors.budget ? 'true' : 'false'}
                value={state.budget}
                onChange={(e) => {
                  set('budget', e.target.value);
                  if (parseAmount(e.target.value) != null) setErrors((er) => ({ ...er, budget: undefined }));
                }}
                onBlur={() => {
                  const cents = parseAmount(state.budget);
                  if (cents != null) set('budget', centsToInput(cents));
                }}
              />
            </div>
          </Field>
          <Field label="End date" htmlFor={id('end-date')} error={errors.endDate} errorId={id('end-date-error')} hint="Optional. Leave empty to run until paused or archived." hintId={id('end-date-hint')}>
            <input
              ref={endRef}
              type="date"
              id={id('end-date')}
              className="ads-field__input"
              min={earliestEnd || undefined}
              aria-describedby={`${id('end-date-error')} ${id('end-date-hint')}`}
              aria-invalid={errors.endDate ? 'true' : 'false'}
              value={state.endDate}
              onChange={(e) => {
                set('endDate', e.target.value);
                setErrors((er) => ({ ...er, endDate: undefined }));
              }}
            />
          </Field>
        </div>

        {isEdit && (
          <fieldset className="ads-choice-group" id={id('status')}>
            <legend className="ads-field__label">Status</legend>
            <div className="ads-segmented ads-segmented--inline" role="radiogroup" aria-label="Campaign status">
              {CAMPAIGN_STATUSES.map((s) => (
                <span key={s.id} style={{ display: 'contents' }}>
                  <input type="radio" name={id('status')} id={id(`status-${s.id}`)} value={s.id} className="ads-segmented__input" checked={state.status === s.id} onChange={() => set('status', s.id)} />
                  <label htmlFor={id(`status-${s.id}`)} className="ads-segmented__label">
                    {s.label}
                  </label>
                </span>
              ))}
            </div>
            <p className="ads-field__hint">Paused campaigns stop serving ads but keep their history. Archived campaigns are hidden from the dashboard unless you filter for them.</p>
          </fieldset>
        )}

        <fieldset className={`ads-choice-group${isEdit ? ' is-locked' : ''}`} id={id('type')}>
          <legend className="ads-field__label">
            Type of campaign
            {isEdit && (
              <span className="ads-tag">
                <Icon name="lock" size={11} />
                Locked
              </span>
            )}
          </legend>
          <div className="ads-choice-row">
            {CAMPAIGN_TYPES.map((t) => (
              <label key={t.id} className="ads-choice" htmlFor={id(`type-${t.id}`)} style={{ '--choice-color': t.color } as React.CSSProperties}>
                <input type="radio" name={id('type')} id={id(`type-${t.id}`)} value={t.id} className="ads-choice__input" checked={state.type === t.id} disabled={isEdit} onChange={() => set('type', t.id)} />
                <span className="ads-choice__swatch" aria-hidden="true">
                  <Icon name={t.icon} size={16} />
                </span>
                <span className="ads-choice__text">
                  <span className="ads-choice__name">{t.label}</span>
                  <span className="ads-choice__desc">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
          {isEdit && <p className="ads-field__hint">The type cannot be changed once a campaign exists. Create a new campaign to use a different type.</p>}
        </fieldset>

        <div className={`ads-field${errors.products ? ' ads-field--invalid' : ''}`} id={id('products')} data-testid={copy.productsId}>
          <div className="ads-field__row">
            <div>
              <span className="ads-field__label">Products</span>
              <p className="ads-field__hint">{n ? `${n} ${n === 1 ? 'product' : 'products'} selected` : 'At least one product is required'}</p>
            </div>
            <button ref={addProductsRef} type="button" className="ads-btn" data-testid={copy.addProducts} onClick={() => setPickerOpen(true)}>
              <Icon name="plus" size={16} />
              <span>Add products</span>
            </button>
          </div>
          {n > 0 ? (
            <>
              <div className="ads-grid-scroll">
                <table className="ads-grid ads-product-grid" aria-label="Selected products">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">SKU</th>
                      <th scope="col">Category</th>
                      <th scope="col" className="is-numeric">
                        Price
                      </th>
                      <th scope="col" className="sr-only-head">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.items.map((p) => (
                      <tr key={p.id} className="ads-grid__row" data-product-id={p.id}>
                        <td data-label="Product">
                          <span className="ads-product__cell">
                            <span className="ads-product__swatch" style={{ '--swatch': '#94a3b8' } as React.CSSProperties} aria-hidden="true">
                              {initials(p.name)}
                            </span>
                            <span className="ads-grid__name">{p.name}</span>
                          </span>
                        </td>
                        <td data-label="SKU" className="ads-grid__mono">
                          {p.sku}
                        </td>
                        <td data-label="Category">{p.category || '—'}</td>
                        <td data-label="Price" className="is-numeric">
                          {money(p.price)}
                        </td>
                        <td className="ads-grid__actions">
                          <button type="button" className="ads-icon-btn ads-icon-btn--danger" aria-label={`Remove "${p.name}"`} title="Remove product" onClick={() => setProducts(state.products.filter((x) => x.id !== p.id))}>
                            <Icon name="x" size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={paged.page}
                pageCount={paged.pageCount}
                pageSize={productPageSize}
                total={paged.total}
                from={paged.from}
                to={paged.to}
                noun="products"
                label="Selected product pages"
                onPage={setProductPage}
                onPageSize={(size) => {
                  if (!isPageSize(size)) return;
                  setProductPage(pageAfterResize(productPage, productPageSize, size));
                  setProductPageSize(size);
                }}
              />
            </>
          ) : (
            <div className="ads-empty ads-empty--compact ads-products-empty">
              <Icon name="package" size={22} />
              <p>No products yet. Add the listings this campaign should promote.</p>
            </div>
          )}
          <p className="ads-field__error" id={id('products-error')} role="alert">
            {errors.products}
          </p>
        </div>

        <fieldset className="ads-choice-group" id={id('bid')}>
          <legend className="ads-field__label">Bid strategy</legend>
          <div className="ads-choice-row ads-choice-row--2">
            {BID_STRATEGIES.map((s) => (
              <label key={s.id} className={`ads-choice${s.available ? '' : ' is-disabled'}`} htmlFor={id(`bid-${s.id}`)} style={{ '--choice-color': '#16a34a' } as React.CSSProperties} title={s.available ? undefined : 'Not available yet'}>
                <input type="radio" name={id('bid')} id={id(`bid-${s.id}`)} value={s.id} className="ads-choice__input" checked={state.bid === s.id} disabled={!s.available} onChange={() => set('bid', s.id)} />
                <span className="ads-choice__swatch" aria-hidden="true">
                  <Icon name={s.available ? 'zap' : 'target'} size={16} />
                </span>
                <span className="ads-choice__text">
                  <span className="ads-choice__name">
                    {s.label}
                    {s.available ? <span className="ads-tag ads-tag--success">Selected</span> : <span className="ads-tag">Coming soon</span>}
                  </span>
                  <span className="ads-choice__desc">{s.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="ads-form__actions">
          <button type="submit" className="ads-btn ads-btn--primary" data-testid={copy.submitId} disabled={submitting || (isEdit && !dirty)}>
            <Icon name={copy.submitIcon} size={16} />
            <span>{submitting ? 'Saving…' : copy.submit}</span>
          </button>
          <button type="button" className="ads-btn ads-btn--ghost" data-testid={copy.cancelId} onClick={onCancel}>
            Cancel
          </button>
          {isEdit && (
            <p className="ads-field__hint ads-form__status" data-testid="ads-edit-dirty" aria-live="polite">
              {campaign ? (dirty ? 'You have unsaved changes' : 'No changes yet') : ''}
            </p>
          )}
        </div>
      </form>

      <ProductPicker api={api} open={pickerOpen} current={state.products} currency={currency} onConfirm={setProducts} onClose={() => setPickerOpen(false)} />
    </section>
  );
});

function Field({ label, htmlFor, error, errorId, hint, hintId, children }: { label: string; htmlFor: string; error?: string; errorId: string; hint?: string; hintId?: string; children: React.ReactNode }) {
  return (
    <div className={`ads-field${error ? ' ads-field--invalid' : ''}`}>
      <label className="ads-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="ads-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      <p className="ads-field__error" id={errorId} role="alert">
        {error}
      </p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ads-facts__item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export type { CampaignUpdate };
