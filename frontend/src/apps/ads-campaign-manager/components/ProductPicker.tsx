import { useEffect, useMemo, useRef, useState } from 'react';
import type { AsyncState } from '../hooks/useAsync';
import { Dialog } from '@shared/ui/Dialog';
import { Icon } from '@shared/ui/Icon';
import type { AdsApi } from '../api/client';
import { useProducts } from '../hooks/useProducts';
import { formatMoney } from '../lib/money';
import { DEFAULT_PAGE_SIZE, isPageSize, pageAfterResize, paginate } from '../lib/pagination';
import type { CatalogueProduct, ProductList, ProductSnapshot } from '../types';
import { Pager } from './Pager';

/** Two-letter placeholder for a product "image". */
export function initials(name: string): string {
  const words = String(name || '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => (w[0] as string).toUpperCase())
    .join('');
}

/** Case-insensitive search over name, SKU and category. */
export function searchProducts(products: CatalogueProduct[], query: string, category: string | null): CatalogueProduct[] {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  return products.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
  });
}

const toSnapshot = ({ id, sku, name, category, price }: ProductSnapshot): ProductSnapshot => ({ id, sku, name, category, price });

interface ProductPickerProps {
  api: AdsApi;
  open: boolean;
  /** Products already on the campaign (pre-ticked). */
  current: ProductSnapshot[];
  currency: string;
  onConfirm: (products: ProductSnapshot[]) => void;
  onClose: () => void;
}

/**
 * "Add products" dialog: searchable, category-filterable catalogue, paged 5
 * products at a time (5 / 10 / 20 selectable), with a checkbox per product.
 * Opens with the campaign's current products ticked; the selection survives
 * searching and paging. Confirming hands the full new selection back.
 */
export function ProductPicker({ api, open, current, currency, onConfirm, onClose }: ProductPickerProps) {
  // The catalogue is fetched once (when first opened) and kept across openings;
  // the body — search, paging, selection — is mounted only while open so it
  // starts fresh every time and only the open picker contributes ids to the page.
  const products = useProducts(api, open);
  return (
    <Dialog open={open} onClose={onClose} className="ads-dialog" aria-labelledby="ads-picker-title" data-testid={open ? 'ads-product-picker' : undefined}>
      {open && <PickerBody products={products} current={current} currency={currency} onConfirm={onConfirm} onClose={onClose} />}
    </Dialog>
  );
}

function PickerBody({ products, current, currency, onConfirm, onClose }: { products: AsyncState<ProductList> } & Omit<ProductPickerProps, 'api' | 'open'>) {
  const { data, loading, error, refresh } = products;
  const [selected, setSelected] = useState<Map<string, ProductSnapshot>>(() => new Map(current.map((p) => [p.id, toSnapshot(p)])));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const catalogue = useMemo(() => data?.items ?? [], [data]);
  const categories = data?.categories ?? [];
  const matching = useMemo(() => searchProducts(catalogue, query, category), [catalogue, query, category]);
  const paged = paginate(matching, page, pageSize);
  const visible = paged.items;
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  function toggleProduct(p: CatalogueProduct, checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) next.set(p.id, toSnapshot(p));
      else next.delete(p.id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of visible) {
        if (allVisibleSelected) next.delete(p.id);
        else next.set(p.id, toSnapshot(p));
      }
      return next;
    });
  }

  const n = selected.size;

  return (
    <>
      <div className="ads-dialog__head">
        <div>
          <h2 className="ads-panel__title" id="ads-picker-title">
            Add products
          </h2>
          <p className="ads-panel__hint">Choose the listings this campaign should advertise.</p>
        </div>
        <button type="button" className="ads-icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      {/* Search, filters and the selection bar stay put; only the list scrolls. */}
      <div className="ads-dialog__toolbar">
        <label className="ads-search ads-search--block">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="search"
            className="ads-field__input"
            placeholder="Search by name, SKU or category"
            aria-label="Search products"
            data-testid="ads-product-search"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="ads-chip-row" role="group" aria-label="Filter by category">
          <button type="button" className={`ads-chip${category == null ? ' is-active' : ''}`} data-category="" aria-pressed={category == null ? 'true' : 'false'} onClick={() => (setCategory(null), setPage(1))}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className={`ads-chip${category === c ? ' is-active' : ''}`} data-category={c} aria-pressed={category === c ? 'true' : 'false'} onClick={() => (setCategory(c), setPage(1))}>
              {c}
            </button>
          ))}
        </div>
        <div className="ads-product-picker__bar">
          <span className="ads-product-picker__count" data-testid="ads-picker-count">
            {n} selected
          </span>
          <button type="button" className="ads-btn ads-btn--sm" disabled={visible.length === 0} onClick={toggleVisible}>
            {allVisibleSelected ? 'Clear shown' : 'Select all shown'}
          </button>
        </div>
      </div>
      <div className="ads-dialog__body">
        {error ? (
          <div className="ads-empty ads-empty--compact">
            <p>Could not load the product catalogue.</p>
            <button type="button" className="ads-btn ads-btn--sm" onClick={refresh}>
              <Icon name="refresh" size={14} />
              <span>Retry</span>
            </button>
          </div>
        ) : loading && !data ? (
          <p className="ads-empty ads-empty--compact">Loading products…</p>
        ) : visible.length === 0 ? (
          <p className="ads-empty ads-empty--compact">No products match your search.</p>
        ) : (
          <ul className="ads-product-list" aria-label="Products">
            {visible.map((p) => {
              const id = `ads-pick-${p.id}`;
              const checked = selected.has(p.id);
              return (
                <li key={p.id} className={`ads-product${checked ? ' is-selected' : ''}`} data-product-id={p.id}>
                  <label className="ads-product__row" htmlFor={id}>
                    <input type="checkbox" id={id} className="ads-product__checkbox" checked={checked} data-product-id={p.id} onChange={(e) => toggleProduct(p, e.target.checked)} />
                    <span className="ads-product__swatch" style={{ '--swatch': p.color } as React.CSSProperties} aria-hidden="true">
                      {initials(p.name)}
                    </span>
                    <span className="ads-product__text">
                      <span className="ads-product__name">{p.name}</span>
                      <span className="ads-product__meta">
                        {p.sku} · {p.category}
                      </span>
                    </span>
                    <span className="ads-product__price">{formatMoney(p.price, { currency })}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <Pager
          page={paged.page}
          pageCount={paged.pageCount}
          pageSize={pageSize}
          total={paged.total}
          from={paged.from}
          to={paged.to}
          noun="products"
          label="Product pages"
          onPage={setPage}
          onPageSize={(size) => {
            if (!isPageSize(size)) return;
            setPage(pageAfterResize(page, pageSize, size));
            setPageSize(size);
          }}
        />
      </div>
      <div className="ads-dialog__actions">
        <button type="button" className="ads-btn ads-btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="ads-btn ads-btn--primary"
          data-testid="ads-picker-confirm"
          onClick={() => {
            onConfirm([...selected.values()]);
            onClose();
          }}
        >
          <Icon name="check" size={16} />
          <span>{n ? `Add ${n} ${n === 1 ? 'product' : 'products'}` : 'Add products'}</span>
        </button>
      </div>
    </>
  );
}
