import { Alert, Platform, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/** Native share sheet for customer sign links (e-sign itself stays on web). */
export async function shareSignLink(signUrl: string, label = 'document'): Promise<void> {
  const message = `Please review and sign this ${label}:\n\n${signUrl}`;
  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { message, url: signUrl, title: 'Customer sign link' }
        : { message, title: 'Customer sign link' },
    );
  } catch (err) {
    Alert.alert(
      'Could not open share sheet',
      err instanceof Error ? err.message : 'Try opening the link instead.',
      [
        { text: 'Open link', onPress: () => void WebBrowser.openBrowserAsync(signUrl) },
        { text: 'OK' },
      ],
    );
  }
}

export async function presentSignLinkResult(result: {
  sign_url?: string;
  message?: string;
}, label = 'document'): Promise<void> {
  if (!result.sign_url) {
    Alert.alert('Sent', result.message || 'Sign link created.');
    return;
  }
  Alert.alert('Sign link ready', 'Customer e-sign stays on the web. Share or open the link.', [
    { text: 'Share', onPress: () => void shareSignLink(result.sign_url!, label) },
    { text: 'Open', onPress: () => void WebBrowser.openBrowserAsync(result.sign_url!) },
    { text: 'OK' },
  ]);
}
