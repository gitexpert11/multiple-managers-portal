import { Icon } from '@shared/ui/Icon';
import { TABS, type TabId } from './routes';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { Theme } from './theme';

interface TabStripProps {
  active: TabId;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}

/** The tab strip: one link per application, plus the workspace theme switcher on the right. */
export function TabStrip({ active, theme, onTheme }: TabStripProps) {
  return (
    <nav className="shell__nav" aria-label="Applications">
      {TABS.map((tab) => (
        <a key={tab.id} className="shell__tab" href={tab.hash} data-tab={tab.id} aria-current={tab.id === active ? 'page' : undefined}>
          <span className="shell__tab-icon">
            <Icon name={tab.icon} size={18} />
          </span>
          <span>{tab.label}</span>
        </a>
      ))}
      <ThemeSwitcher theme={theme} onChange={onTheme} />
    </nav>
  );
}
