import { Icon } from '@shared/ui/Icon';
import { PERIOD_PRESETS, canShiftForward, shiftRange } from '../lib/periods';
import type { Period, ResolvedRange } from '../types';

interface PeriodSelectorProps {
  range: ResolvedRange;
  today: string;
  onChange: (period: Period) => void;
}

/**
 * Time period selector for the dashboard: a preset dropdown (last 7/14/30/90
 * days, this/last month, custom), previous/next arrows that slide the window
 * by its own length, and from/to date inputs that appear for custom ranges.
 */
export function PeriodSelector({ range, today, onChange }: PeriodSelectorProps) {
  const custom = range.preset === 'custom';
  return (
    <div className="ads-period" role="group" aria-label="Select time period" data-testid="ads-period">
      <span className="ads-period__icon">
        <Icon name="calendar" size={16} />
      </span>
      <button type="button" className="ads-period__btn" aria-label="Previous period" title="Previous period" onClick={() => onChange(shiftRange(range, -1, today))}>
        <Icon name="chevronLeft" />
      </button>
      <select
        className="ads-period__select"
        aria-label="Time period"
        data-testid="ads-period-preset"
        value={range.preset}
        onChange={(e) => {
          const preset = e.target.value;
          onChange(preset === 'custom' ? { preset, from: range.from, to: range.to } : { preset });
        }}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button type="button" className="ads-period__btn" aria-label="Next period" title="Next period" disabled={!canShiftForward(range, today)} onClick={() => onChange(shiftRange(range, 1, today))}>
        <Icon name="chevronRight" />
      </button>
      <div className="ads-period__custom" hidden={!custom}>
        <input type="date" className="ads-period__date" aria-label="From date" data-testid="ads-period-from" value={range.from} max={range.to} onChange={(e) => onChange({ preset: 'custom', from: e.target.value || range.from, to: range.to })} />
        <span className="ads-period__sep" aria-hidden="true">
          –
        </span>
        <input type="date" className="ads-period__date" aria-label="To date" data-testid="ads-period-to" value={range.to} min={range.from} max={today} onChange={(e) => onChange({ preset: 'custom', from: range.from, to: e.target.value || range.to })} />
      </div>
      <span className="ads-period__label" aria-live="polite" data-testid="ads-period-label">
        {range.label} · {range.days} {range.days === 1 ? 'day' : 'days'}
      </span>
    </div>
  );
}
