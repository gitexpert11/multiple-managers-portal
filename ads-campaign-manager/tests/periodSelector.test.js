import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePeriod } from '../src/lib/periods.js';
import { createPeriodSelector } from '../src/ui/periodSelector.js';

const TODAY = '2025-03-15';
let host;
let onChange;
let picker;

function set(period) {
  picker.update({ period, range: resolvePeriod(period, TODAY), today: TODAY });
}
const q = (sel) => host.querySelector(sel);
const change = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  onChange = vi.fn();
  picker = createPeriodSelector(host, { onChange });
  set({ preset: '30d' });
});

afterEach(() => host.remove());

describe('period selector', () => {
  it('lists every preset and shows the resolved range', () => {
    expect([...q('[data-testid=ads-period-preset]').options].map((o) => o.value)).toEqual(['7d', '14d', '30d', '90d', 'thisMonth', 'lastMonth', 'custom']);
    expect(q('[data-testid=ads-period-preset]').value).toBe('30d');
    expect(q('[data-testid=ads-period-label]').textContent).toBe('Feb 14 – Mar 15, 2025 · 30 days');
    expect(q('.ads-period__custom').hidden).toBe(true);
    expect(q('[aria-label="Next period"]').disabled).toBe(true); // already ends today
  });

  it('emits the chosen preset', () => {
    change(q('[data-testid=ads-period-preset]'), '7d');
    expect(onChange).toHaveBeenCalledWith({ preset: '7d' });
    change(q('[data-testid=ads-period-preset]'), 'lastMonth');
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'lastMonth' });
  });

  it('switching to custom seeds the dates with the current range and reveals the inputs', () => {
    change(q('[data-testid=ads-period-preset]'), 'custom');
    expect(onChange).toHaveBeenCalledWith({ preset: 'custom', from: '2025-02-14', to: '2025-03-15' });
    set({ preset: 'custom', from: '2025-02-14', to: '2025-03-15' });
    expect(q('.ads-period__custom').hidden).toBe(false);
    expect(q('[data-testid=ads-period-from]').value).toBe('2025-02-14');
    expect(q('[data-testid=ads-period-to]').value).toBe('2025-03-15');
    expect(q('[data-testid=ads-period-to]').max).toBe(TODAY);
    expect(q('[data-testid=ads-period-from]').max).toBe('2025-03-15');
    expect(q('[data-testid=ads-period-to]').min).toBe('2025-02-14');
  });

  it('custom date edits emit a custom period', () => {
    set({ preset: 'custom', from: '2025-02-14', to: '2025-03-15' });
    change(q('[data-testid=ads-period-from]'), '2025-03-01');
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'custom', from: '2025-03-01', to: '2025-03-15' });
    change(q('[data-testid=ads-period-to]'), '2025-03-10'); // the typed "from" is kept
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'custom', from: '2025-03-01', to: '2025-03-10' });
  });

  it('edge: clearing a date input keeps the current bound', () => {
    set({ preset: 'custom', from: '2025-02-14', to: '2025-03-15' });
    change(q('[data-testid=ads-period-from]'), '');
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'custom', from: '2025-02-14', to: '2025-03-15' });
  });

  it('previous/next slide the window by its length; next is enabled only when the range ends before today', () => {
    q('[aria-label="Previous period"]').click();
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'custom', from: '2025-01-15', to: '2025-02-13' });
    set({ preset: 'custom', from: '2025-01-15', to: '2025-02-13' });
    expect(q('[aria-label="Next period"]').disabled).toBe(false);
    q('[aria-label="Next period"]').click();
    expect(onChange).toHaveBeenLastCalledWith({ preset: 'custom', from: '2025-02-14', to: '2025-03-15' });
  });
});
