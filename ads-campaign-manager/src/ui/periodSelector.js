import { PERIOD_PRESETS, canShiftForward, shiftRange } from '../lib/periods.js';
import { h, icon, replaceChildren } from './dom.js';

/**
 * Time period selector for the dashboard: a preset dropdown (last 7/14/30/90
 * days, this/last month, custom), previous/next arrows that slide the window
 * by its own length, and from/to date inputs that appear for custom ranges.
 *
 * The parent owns the period; this component only emits `onChange(period)`
 * with `{ preset, from?, to? }` and re-renders from `update({ period, range, today })`.
 */
export function createPeriodSelector(container, { onChange }) {
  let period = { preset: '30d' };
  let range = null;
  let today = '';

  const presetSelect = h('select', {
    class: 'ads-period__select',
    'aria-label': 'Time period',
    'data-testid': 'ads-period-preset',
    onchange: () => {
      const preset = presetSelect.value;
      if (preset === 'custom') onChange({ preset, from: range?.from, to: range?.to });
      else onChange({ preset });
    },
  });
  replaceChildren(presetSelect, ...PERIOD_PRESETS.map((p) => h('option', { value: p.id }, p.label)));

  const fromInput = h('input', { type: 'date', class: 'ads-period__date', 'aria-label': 'From date', 'data-testid': 'ads-period-from', onchange: emitCustom });
  const toInput = h('input', { type: 'date', class: 'ads-period__date', 'aria-label': 'To date', 'data-testid': 'ads-period-to', onchange: emitCustom });
  const customRow = h('div', { class: 'ads-period__custom', hidden: true }, fromInput, h('span', { class: 'ads-period__sep', 'aria-hidden': 'true' }, '–'), toInput);

  const prevBtn = h('button', { type: 'button', class: 'ads-period__btn', 'aria-label': 'Previous period', title: 'Previous period', onclick: () => range && onChange(shiftRange(range, -1, today)) }, icon('chevronLeft'));
  const nextBtn = h('button', { type: 'button', class: 'ads-period__btn', 'aria-label': 'Next period', title: 'Next period', onclick: () => range && onChange(shiftRange(range, 1, today)) }, icon('chevronRight'));
  const label = h('span', { class: 'ads-period__label', 'aria-live': 'polite', 'data-testid': 'ads-period-label' });

  const root = h(
    'div',
    { class: 'ads-period', role: 'group', 'aria-label': 'Select time period', 'data-testid': 'ads-period' },
    h('span', { class: 'ads-period__icon' }, icon('calendar', 16)),
    prevBtn,
    presetSelect,
    nextBtn,
    customRow,
    label,
  );
  container.append(root);

  function emitCustom() {
    onChange({ preset: 'custom', from: fromInput.value || range?.from, to: toInput.value || range?.to });
  }

  return {
    root,
    /** @param {{period: {preset: string, from?: string, to?: string}, range: {from: string, to: string, days: number, label: string}, today: string}} props */
    update(props) {
      period = props.period;
      range = props.range;
      today = props.today;
      presetSelect.value = range.preset;
      const custom = range.preset === 'custom';
      customRow.hidden = !custom;
      fromInput.value = range.from;
      toInput.value = range.to;
      fromInput.max = range.to;
      toInput.min = range.from;
      toInput.max = today;
      nextBtn.disabled = !canShiftForward(range, today);
      label.textContent = `${range.label} · ${range.days} ${range.days === 1 ? 'day' : 'days'}`;
    },
  };
}
