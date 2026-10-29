import { createContext, useContext } from 'react';
import type { Dashboard, Range } from '../../src/shared/types';
export interface AppState {
  data: Dashboard;
  range: Range;
  size: number;
  setSize: (n: number) => void;
  safe: boolean;
  watchlist: string[];
  toggleWatch: (id: string) => void;
  navigate: (path: string) => void;
  ask: (question: string) => void;
  notify: (message: string) => void;
  connect: () => void;
}
export const AppContext = createContext<AppState | null>(null);
export function useApp() {
  return useContext(AppContext)!;
}
