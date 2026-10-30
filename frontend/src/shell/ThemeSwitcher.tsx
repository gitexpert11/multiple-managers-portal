import { Icon, type IconName } from '@shared/ui/Icon';
import type { Theme } from './theme';

const OPTIONS: { value: Theme; label: string; title: string; icon: IconName }[] = [
  { value: 'system', label: 'System', title: 'Match the system theme', icon: 'monitor' },
  { value: 'light', label: 'Light', title: 'Light theme', icon: 'sun' },
  { value: 'dark', label: 'Dark', title: 'Dark theme', icon: 'moon' },
];

/** Segmented System / Light / Dark control (a radio group, so it is keyboard and screen-reader friendly). */
export function ThemeSwitcher({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div className="shell__theme" role="radiogroup" aria-label="Theme" data-testid="theme-switcher">
      {OPTIONS.map((opt) => {
        const id = `shell-theme-${opt.value}`;
        return (
          <span key={opt.value} style={{ display: 'contents' }}>
            <input type="radio" name="shell-theme" id={id} value={opt.value} className="shell__theme-input" checked={theme === opt.value} onChange={() => onChange(opt.value)} />
            <label htmlFor={id} className="shell__theme-option" title={opt.title}>
              <span className="shell__theme-icon">
                <Icon name={opt.icon} size={16} />
              </span>
              <span className="shell__theme-label">{opt.label}</span>
            </label>
          </span>
        );
      })}
    </div>
  );
}
