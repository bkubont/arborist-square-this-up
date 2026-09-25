import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';

import { api } from '@/api/client';
import { todayIso } from '@/lib/expenseCategories';
import { photoCategoryMeta, type PhotoCategoryKey } from '@/lib/photoCategories';

const QUEUE_KEY = 'stu.offlinePhotoQueue.v1';
const DIR = `${FileSystem.documentDirectory || ''}offline-photos/`;

export type QueuedPhotoKind = 'job_photo' | 'job_receipt' | 'expense_receipt';

export type QueuedPhoto = {
  id: string;
  /** Persisted file:// under documentDirectory/offline-photos/ */
  localUri: string;
  createdAt: string;
  kind: QueuedPhotoKind;
  jobId?: string;
  category?: PhotoCategoryKey | string;
  amount?: number;
  text?: string;
  /** Material Order receipt attachment. */
  materialOrderId?: string;
};

type Listener = (items: QueuedPhoto[]) => void;

const listeners = new Set<Listener>();
let memory: QueuedPhoto[] | null = null;
let flushing = false;

function notify(items: QueuedPhoto[]) {
  for (const fn of listeners) fn(items);
}

export function subscribeOfflinePhotoQueue(listener: Listener): () => void {
  listeners.add(listener);
  void listQueuedPhotos().then(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function ensureDir() {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
}

async function readQueue(): Promise<QueuedPhoto[]> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    memory = raw ? (JSON.parse(raw) as QueuedPhoto[]) : [];
  } catch {
    memory = [];
  }
  return memory;
}

async function writeQueue(items: QueuedPhoto[]) {
  memory = items;
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notify(items);
}

export async function listQueuedPhotos(): Promise<QueuedPhoto[]> {
  return readQueue();
}

export async function isNetworkOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  // isInternetReachable can be null while unknown — treat null as online when connected
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function isLikelyNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('failed to fetch') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('connection') ||
    lower.includes('unreachable')
  );
}

/** Copy picker URI into durable storage so temp camera files survive. */
async function persistLocalCopy(sourceUri: string, id: string): Promise<string> {
  await ensureDir();
  const dest = `${DIR}${id}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export type EnqueuePhotoInput = {
  sourceUri: string;
  kind: QueuedPhotoKind;
  jobId?: string;
  category?: string;
  amount?: number;
  text?: string;
  materialOrderId?: string;
};

export async function enqueuePhoto(input: EnqueuePhotoInput): Promise<QueuedPhoto> {
  const id = `opq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const localUri = await persistLocalCopy(input.sourceUri, id);
  const item: QueuedPhoto = {
    id,
    localUri,
    createdAt: new Date().toISOString(),
    kind: input.kind,
    jobId: input.jobId,
    category: input.category,
    amount: input.amount,
    text: input.text,
    materialOrderId: input.materialOrderId,
  };
  const next = [...(await readQueue()), item];
  await writeQueue(next);
  return item;
}

async function removeQueued(id: string) {
  const list = await readQueue();
  const item = list.find(i => i.id === id);
  const next = list.filter(i => i.id !== id);
  await writeQueue(next);
  if (item?.localUri) {
    try {
      await FileSystem.deleteAsync(item.localUri, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
}

async function flushOne(item: QueuedPhoto): Promise<void> {
  const { file_url } = await api.uploadFile(item.localUri);

  if (item.kind === 'job_photo' || item.kind === 'job_receipt') {
    if (!item.jobId) throw new Error('Queued photo missing job');
    const category = (item.category || (item.kind === 'job_receipt' ? 'receipt' : 'before')) as string;
    const meta = photoCategoryMeta(category);
    await api.entities.TimelineEntry.create({
      job_id: item.jobId,
      type: meta.type,
      text: item.text || `${meta.label} photo`,
      photo_url: file_url,
      category: meta.key,
      ...(item.materialOrderId
        ? { related_material_order_id: item.materialOrderId }
        : {}),
    });
    return;
  }

  // expense_receipt — Scan Receipt / inbox path
  const amount = item.amount ?? 0;
  if (item.jobId) {
    await api.entities.TimelineEntry.create({
      job_id: item.jobId,
      type: 'receipt',
      category: 'receipt',
      photo_url: file_url,
      amount: amount || undefined,
      text: amount ? `Receipt ${amount}` : 'Receipt',
    });
    if (amount > 0) {
      await api.entities.Expense.create({
        amount,
        date: todayIso(),
        category: 'Materials',
        job_id: item.jobId,
        photo_url: file_url,
        note: 'From receipt capture (offline queue)',
      });
    }
  } else {
    await api.entities.Expense.create({
      amount,
      date: todayIso(),
      category: 'Materials',
      photo_url: file_url,
      note: 'Unassigned receipt (offline queue)',
    });
  }
}

/**
 * Upload queued photos when online. Returns how many succeeded.
 * Stops on the first network error so remaining stay queued.
 */
export async function flushOfflinePhotoQueue(): Promise<{ uploaded: number; remaining: number }> {
  if (flushing) {
    const list = await readQueue();
    return { uploaded: 0, remaining: list.length };
  }
  const online = await isNetworkOnline();
  if (!online) {
    const list = await readQueue();
    return { uploaded: 0, remaining: list.length };
  }

  flushing = true;
  let uploaded = 0;
  try {
    // Re-read each iteration so concurrent enqueue is safe
    for (;;) {
      const list = await readQueue();
      const item = list[0];
      if (!item) break;
      try {
        await flushOne(item);
        await removeQueued(item.id);
        uploaded += 1;
      } catch (err) {
        if (isLikelyNetworkError(err)) break;
        // Permanent failure (e.g. 413) — drop so it doesn't block the queue
        await removeQueued(item.id);
        throw err;
      }
    }
  } finally {
    flushing = false;
  }
  const remaining = (await readQueue()).length;
  return { uploaded, remaining };
}

/**
 * Try upload now; if offline or network error, enqueue and return queued=true.
 */
export async function uploadOrEnqueue(input: EnqueuePhotoInput): Promise<
  | { queued: false; file_url: string }
  | { queued: true; item: QueuedPhoto }
> {
  const online = await isNetworkOnline();
  if (!online) {
    const item = await enqueuePhoto(input);
    return { queued: true, item };
  }
  try {
    const { file_url } = await api.uploadFile(input.sourceUri);
    return { queued: false, file_url };
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      const item = await enqueuePhoto(input);
      return { queued: true, item };
    }
    throw err;
  }
}
