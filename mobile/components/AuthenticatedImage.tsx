import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { absoluteFileUrl, authHeaders } from '@/api/client';
import { BRAND_HEX } from '@/lib/brand';

type Props = {
  /** Relative `/api/files/:id` or absolute URL from the API. */
  fileUrl: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageProps['contentFit'];
};

/**
 * Loads owner-gated files with Bearer (RN Image cannot rely on cookies).
 * Uses expo-image `headers` so web cookie path on the API stays unchanged.
 */
export function AuthenticatedImage({ fileUrl, style, contentFit = 'cover' }: Props) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const uri = absoluteFileUrl(fileUrl);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await authHeaders();
      if (!cancelled) setHeaders(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!uri) {
    return <View style={[styles.placeholder, style]} />;
  }

  if (!headers) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator color={BRAND_HEX.royalBlue} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri, headers }}
      style={style as ImageProps['style']}
      contentFit={contentFit}
      transition={200}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#e8e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
