import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { api, type Client, type Job } from '@/api/client';
import { FormError, FormField, formStyles } from '@/components/FormFields';
import { JobPhaseStatusSelect } from '@/components/JobPhaseStatusSelect';
import { resolvePhaseStatus, type JobPhase } from '@/lib/jobStatus';

type Props = {
  job?: Job | null;
  defaultClientId?: string;
};

export function JobForm({ job, defaultClientId = '' }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [title, setTitle] = useState(job?.title || '');
  const [description, setDescription] = useState(job?.description || '');
  const initial = resolvePhaseStatus(job?.phase, job?.status);
  const [phase, setPhase] = useState<JobPhase>(initial.phase);
  const [status, setStatus] = useState(initial.status);
  const [clientId, setClientId] = useState(job?.client_id || defaultClientId || '');
  const [startDate, setStartDate] = useState(job?.start_date || '');
  const [endDate, setEndDate] = useState(job?.end_date || '');
  const [notes, setNotes] = useState(job?.notes || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.entities.Client.list('-updated_date');
        if (!cancelled) {
          setClients([...list].sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load customers');
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!title.trim()) {
      setError('Enter a job title.');
      return;
    }
    if (!clientId) {
      setError('Select a customer.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const client = clients.find(c => c.id === clientId);
      const payload = {
        title: title.trim(),
        client_id: clientId,
        client_name: client?.name || job?.client_name,
        description: description.trim() || undefined,
        phase,
        status,
        start_date: startDate.trim() || '',
        end_date: endDate.trim() || '',
        notes: notes.trim() || undefined,
      };
      if (job?.id) {
        await api.entities.Job.update(job.id, payload);
        router.replace(`/(app)/jobs/${job.id}`);
      } else {
        const created = await api.entities.Job.create(payload);
        router.replace(`/(app)/jobs/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={formStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={formStyles.content} keyboardShouldPersistTaps="handled">
        <FormError message={error} />
        <FormField label="Title" required value={title} onChangeText={setTitle} placeholder="Kitchen faucet replacement" />

        <Text style={formStyles.sectionLabel}>Customer *</Text>
        {loadingClients ? (
          <ActivityIndicator color="#0504AA" />
        ) : clients.length === 0 ? (
          <Text style={{ color: '#666' }}>Create a customer first.</Text>
        ) : (
          <View style={formStyles.chipRow}>
            {clients.map(c => {
              const active = c.id === clientId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setClientId(c.id)}
                  style={[formStyles.chip, active && formStyles.chipActive]}
                >
                  <Text style={[formStyles.chipText, active && formStyles.chipTextActive]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <FormField label="Description" value={description} onChangeText={setDescription} multiline />

        <Text style={formStyles.sectionLabel}>Phase & status</Text>
        <JobPhaseStatusSelect
          phase={phase}
          status={status}
          onChange={({ phase: nextPhase, status: nextStatus }) => {
            setPhase(nextPhase);
            setStatus(nextStatus);
          }}
        />

        <FormField
          label="Start date"
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <FormField
          label="End date"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <FormField label="Notes" value={notes} onChangeText={setNotes} multiline />

        <Pressable
          style={({ pressed }) => [formStyles.button, (pressed || busy) && formStyles.buttonDisabled]}
          onPress={submit}
          disabled={busy || loadingClients}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={formStyles.buttonText}>{job ? 'Save' : 'Create job'}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
