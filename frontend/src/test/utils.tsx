import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { NowContext } from '@shared/hooks/useNow';
import { ThemeContext, type Theme } from '@/shell/theme';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  now?: Date;
  theme?: Theme;
}

/** Render with the workspace providers (pinned clock + theme). */
export function renderWithProviders(ui: ReactElement, { now = new Date(2025, 2, 15, 10), theme = 'system', ...options }: Options = {}) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <NowContext.Provider value={() => now}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </NowContext.Provider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}

export const NOW = new Date(2025, 2, 15, 10); // 15 March 2025
export const TODAY = '2025-03-15';
