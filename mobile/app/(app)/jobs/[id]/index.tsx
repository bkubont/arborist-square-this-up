import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CollapsibleSection } from '@/components/CollapsibleSection';
import { JobDocumentsSection } from '@/components/JobDocumentsSection';
import { JobFinancialSection } from '@/components/JobFinancialSection';
import { JobMaterialsSection } from '@/components/JobMaterialsSection';
import { JobPhotosSection } from '@/components/JobPhotosSection';
import { JobTasksSection } from '@/components/JobTasksSection';
import { JobTimelineSection } from '@/components/JobTimelineSection';
import { BRAND_HEX } from '@/lib/brand';
import { jobDetailQueryKey, loadJobDetail } from '@/lib/jobDetail';
import { deriveMaterialsStatus, materialsStatusColor } from '@/lib/jobMaterials';
import { formatJobStatus } from '@/lib/jobStatus';
import { isPhotoEntry, isReceiptEntry } from '@/lib/photoCategories';

export default function JobDetailScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const photosInitialMode = tab === 'receipts' ? 'receipts' : 'photos';
  const openReceipts = tab === 'receipts';

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: jobDetailQueryKey(id || ''),
    queryFn: () => loadJobDetail(id!),
    enabled: !!id,
  });

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      void refetch();
    }, [id, refetch]),
  );

  const onChanged = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: jobDetailQueryKey(id) });
  }, [id, queryClient]);

  if ((isLoading || isFetching) && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  const errMsg = error instanceof Error ? error.message : error ? 'Failed to load job' : '';
  if (errMsg || !data?.job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{errMsg || 'Job not found'}</Text>
      </View>
    );
  }

  const { job, client, entries, documents, workItems, materialOrders, summary, authorized, payments } =
    data;
  const materialsStatus = deriveMaterialsStatus({
    job,
    workItems,
    materialOrders,
  });
  const photoCount = entries.filter(e => isPhotoEntry(e) && !isReceiptEntry(e)).length;
  const receiptCount = entries.filter(isReceiptEntry).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{job.title}</Text>
      <Text style={styles.badge}>{formatJobStatus(job) || job.status || '—'}</Text>
      {job.archived_at ? <Text style={styles.archived}>Archived</Text> : null}
      <Text style={styles.materialsStatus}>
        Materials ·{' '}
        <Text style={{ color: materialsStatusColor(materialsStatus.key), fontWeight: '600' }}>
          {materialsStatus.label}
        </Text>
      </Text>
      {job.description ? <Text style={styles.body}>{job.description}</Text> : null}

      <Pressable style={styles.editBtn} onPress={() => router.push(`/(app)/jobs/${job.id}/edit`)}>
        <Text style={styles.editText}>Edit job</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.label}>Customer</Text>
        <Text style={styles.value}>{client?.name || job.client_name || '—'}</Text>
        {client ? (
          <Pressable onPress={() => router.push(`/(app)/customers/${client.id}`)}>
            <Text style={styles.link}>View customer</Text>
          </Pressable>
        ) : null}
      </View>

      <CollapsibleSection title="Money" defaultOpen={!openReceipts}>
        <JobFinancialSection
          jobId={job.id}
          summary={summary}
          authorized={authorized}
          payments={payments}
          materialsCost={job.materials_cost}
          onChanged={onChanged}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Materials checklist"
        count={(job.materials || []).length}
        defaultOpen={false}
      >
        <JobMaterialsSection
          jobId={job.id}
          materials={job.materials || []}
          onChanged={onChanged}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Documents" count={documents.length} defaultOpen={false}>
        <JobDocumentsSection jobId={job.id} documents={documents} onChanged={onChanged} />
      </CollapsibleSection>

      <CollapsibleSection title="Tasks" count={workItems.length} defaultOpen={!openReceipts}>
        <JobTasksSection jobId={job.id} items={workItems} onChanged={onChanged} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Photos & receipts"
        count={photoCount + receiptCount}
        defaultOpen
      >
        <JobPhotosSection
          jobId={job.id}
          entries={entries}
          onChanged={onChanged}
          initialMode={photosInitialMode}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Timeline" count={entries.length} defaultOpen={false}>
        <JobTimelineSection jobId={job.id} entries={entries} onChanged={onChanged} />
      </CollapsibleSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7fb' },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: BRAND_HEX.black },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8e8f8',
    color: BRAND_HEX.royalBlue,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: '600',
  },
  archived: { fontSize: 12, color: '#888' },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  materialsStatus: { fontSize: 13, color: '#666' },
  editBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: BRAND_HEX.royalBlue,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: { color: BRAND_HEX.royalBlue, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e4e4ef',
    gap: 6,
  },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  value: { fontSize: 17, fontWeight: '600', color: BRAND_HEX.black },
  link: { color: BRAND_HEX.royalBlue, fontWeight: '600', marginTop: 4 },
  error: { color: '#b00020' },
});
