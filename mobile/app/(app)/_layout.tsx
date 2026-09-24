import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX } from '@/lib/brand';

export default function AppLayout() {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) return null;
  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerTintColor: BRAND_HEX.royalBlue }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="jobs/[id]" options={{ title: 'Job' }} />
      <Stack.Screen name="customers/[id]" options={{ title: 'Customer' }} />
    </Stack>
  );
}
