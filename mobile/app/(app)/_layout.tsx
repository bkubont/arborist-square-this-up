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
      <Stack.Screen name="customers/new" options={{ title: 'New customer' }} />
      <Stack.Screen name="customers/[id]/index" options={{ title: 'Customer' }} />
      <Stack.Screen name="customers/[id]/edit" options={{ title: 'Edit customer' }} />
      <Stack.Screen name="jobs/new" options={{ title: 'New job' }} />
      <Stack.Screen name="jobs/[id]/index" options={{ title: 'Job' }} />
      <Stack.Screen name="jobs/[id]/edit" options={{ title: 'Edit job' }} />
      <Stack.Screen name="estimates/[id]" options={{ title: 'Estimate' }} />
      <Stack.Screen name="invoices/[id]" options={{ title: 'Invoice' }} />
      <Stack.Screen name="expenses/new" options={{ title: 'New expense' }} />
      <Stack.Screen name="expenses/[id]/index" options={{ title: 'Expense' }} />
      <Stack.Screen name="expenses/[id]/edit" options={{ title: 'Edit expense' }} />
    </Stack>
  );
}
