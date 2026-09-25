import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { WorkItemForm } from '@/components/WorkItemForm';
import { BRAND_HEX } from '@/lib/brand';

export default function NewWorkItemScreen() {
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();

  if (!jobId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Missing job. Open a job and add a task from there.</Text>
      </View>
    );
  }

  return <WorkItemForm jobId={jobId} />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#b00020', textAlign: 'center' },
});
