import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { api, type Client } from '@/api/client';
import { ClientForm } from '@/components/ClientForm';
import { BRAND_HEX } from '@/lib/brand';

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const next = await api.entities.Client.get(id);
        if (!cancelled) setClient(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#b00020' }}>{error}</Text>
      </View>
    );
  }

  if (!client) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return <ClientForm client={client} />;
}
