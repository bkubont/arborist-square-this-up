import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { BRAND_HEX } from '@/lib/brand';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoadingAuth) return;
    const inAuth = segments[0] === 'login';
    if (!isAuthenticated && !inAuth) router.replace('/login');
    else if (isAuthenticated && inAuth) router.replace('/');
  }, [isAuthenticated, isLoadingAuth, segments, router]);

  if (isLoadingAuth) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7fb' }}>
        <ActivityIndicator size="large" color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerTintColor: BRAND_HEX.royalBlue }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}
