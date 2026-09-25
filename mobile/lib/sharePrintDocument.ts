import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Write printable HTML to cache and open the system share sheet (mirrors web print layout). */
export async function sharePrintHtml(html: string, filename: string, title: string): Promise<void> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const file = new File(Paths.cache, safeName.endsWith('.html') ? safeName : `${safeName}.html`);
  try {
    file.create({ overwrite: true });
    file.write(html);

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Sharing unavailable', 'This device cannot share files.');
      return;
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/html',
      dialogTitle: title,
      UTI: 'public.html',
    });
  } catch (err) {
    Alert.alert('Could not share', err instanceof Error ? err.message : 'Try again.');
  }
}
