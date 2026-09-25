import { AppState, type AppStateStatus, Platform } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';

/** Light defaults — refetch on focus, short stale window; no offline sync. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

/** Wire React Query focus to AppState (native). Web already has window focus. */
export function setupReactQueryFocus(): () => void {
  if (Platform.OS === 'web') return () => {};
  const onChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
