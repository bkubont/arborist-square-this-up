import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { BRAND_HEX, PRODUCT_NAME } from '@/lib/brand';

/** Dashboard stub — primary Home tab (navConfig Dashboard). */
export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>{PRODUCT_NAME}</Text>
      <Text style={styles.heading}>Dashboard</Text>
      <Text style={styles.meta}>Signed in as {user?.email}</Text>
      <Text style={styles.meta}>API {api.baseUrl}</Text>
      <View style={styles.links}>
        <Link href="/(app)/(tabs)/jobs" style={styles.link}>
          Jobs
        </Link>
        <Link href="/(app)/(tabs)/customers" style={styles.link}>
          Customers
        </Link>
        <Link href="/(app)/(tabs)/more" style={styles.link}>
          Settings
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f7f7fb', gap: 10 },
  brand: { fontSize: 28, fontWeight: '700', color: BRAND_HEX.royalBlue, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '600', color: BRAND_HEX.black },
  meta: { fontSize: 14, color: '#555' },
  links: { marginTop: 16, gap: 12 },
  link: { fontSize: 16, fontWeight: '600', color: BRAND_HEX.royalBlue },
});
