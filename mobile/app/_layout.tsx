import { Stack } from 'expo-router';
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
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f7fb' }}>
        <ActivityIndicator size="large" color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerTintColor: BRAND_HEX.royalBlue }}>
      <Stack.Screen name="index" options={{ title: 'Home', headerShown: true }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack>
  );
}
