import * as ImagePicker from 'expo-image-picker';

export type ImageSource = 'camera' | 'library';

/**
 * Request permission and return a local image URI, or null if cancelled / denied.
 * Caller uploads via `api.uploadFile`.
 */
export async function pickImage(source: ImageSource): Promise<{ uri: string } | { error: string } | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return { error: 'Camera permission is required.' };
    }
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return { error: 'Photo library permission is required.' };
    }
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 1,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          allowsMultipleSelection: false,
        });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return { uri: result.assets[0].uri };
}
