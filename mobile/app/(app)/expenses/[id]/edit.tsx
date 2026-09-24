import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { api, type Expense } from '@/api/client';
import { ExpenseForm } from '@/components/ExpenseForm';
import { BRAND_HEX } from '@/lib/brand';

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const next = await api.entities.Expense.get(id);
        if (!cancelled) setExpense(next);
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
  if (!expense) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }
  return <ExpenseForm expense={expense} />;
}
