import { useLocalSearchParams } from 'expo-router';
import { JobForm } from '@/components/JobForm';

export default function NewJobScreen() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  return <JobForm defaultClientId={clientId || ''} />;
}
