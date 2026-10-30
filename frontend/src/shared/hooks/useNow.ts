import { createContext, useContext } from 'react';

/**
 * "What time is it?" is injectable so tests (and the shell) can pin the clock.
 * Components call `useNow()()` rather than `new Date()` directly.
 */
export const NowContext = createContext<() => Date>(() => new Date());

export function useNow(): () => Date {
  return useContext(NowContext);
}
