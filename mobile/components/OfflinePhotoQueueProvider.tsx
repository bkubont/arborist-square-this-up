import NetInfo from '@react-native-community/netinfo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BRAND_HEX } from '@/lib/brand';
import {
  flushOfflinePhotoQueue,
  subscribeOfflinePhotoQueue,
  type QueuedPhoto,
} from '@/lib/offlinePhotoQueue';

type Ctx = {
  pending: QueuedPhoto[];
  pendingCount: number;
  flushing: boolean;
  flushNow: () => Promise<void>;
};

const OfflinePhotoQueueContext = createContext<Ctx>({
  pending: [],
  pendingCount: 0,
  flushing: false,
  flushNow: async () => {},
});

export function useOfflinePhotoQueue() {
  return useContext(OfflinePhotoQueueContext);
}

/**
 * Listens for connectivity and drains the offline photo/receipt upload queue.
 * Renders a slim banner when items are waiting.
 */
export function OfflinePhotoQueueProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<QueuedPhoto[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const flushingRef = useRef(false);

  useEffect(() => subscribeOfflinePhotoQueue(setPending), []);

  const flushNow = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setFlushing(true);
    setBannerError('');
    try {
      await flushOfflinePhotoQueue();
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      flushingRef.current = false;
      setFlushing(false);
    }
  }, []);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online =
        state.isConnected !== false && state.isInternetReachable !== false;
      if (online) void flushNow();
    });
    void flushNow();
    return unsub;
  }, [flushNow]);

  // When new items are enqueued while already online, try again.
  useEffect(() => {
    if (pending.length > 0) void flushNow();
  }, [pending.length, flushNow]);

  const value = useMemo(
    () => ({
      pending,
      pendingCount: pending.length,
      flushing,
      flushNow,
    }),
    [pending, flushing, flushNow],
  );

  return (
    <OfflinePhotoQueueContext.Provider value={value}>
      {children}
      {pending.length > 0 ? (
        <View style={styles.banner} pointerEvents="box-none">
          <Pressable onPress={() => void flushNow()} style={styles.bannerInner}>
            <Text style={styles.bannerText}>
              {flushing
                ? `Uploading ${pending.length} queued photo${pending.length === 1 ? '' : 's'}…`
                : `${pending.length} photo${pending.length === 1 ? '' : 's'} waiting to upload · Tap to retry`}
            </Text>
            {bannerError ? <Text style={styles.bannerErr}>{bannerError}</Text> : null}
          </Pressable>
        </View>
      ) : null}
    </OfflinePhotoQueueContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 50,
  },
  bannerInner: {
    backgroundColor: BRAND_HEX.black,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerText: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  bannerErr: { color: '#ffb4b4', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
