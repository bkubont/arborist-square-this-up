import Constants from 'expo-constants';

type Extra = {
  linkHost?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

function trimUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Store-listing / App Review URLs from env + app.config `extra`.
 * Leave empty until live HTTPS pages exist (see eas-store-setup walkthrough).
 */
export function getPrivacyPolicyUrl(): string {
  return (
    trimUrl(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL) ||
    trimUrl(extra().privacyPolicyUrl)
  );
}

export function getSupportUrl(): string {
  return (
    trimUrl(process.env.EXPO_PUBLIC_SUPPORT_URL) || trimUrl(extra().supportUrl)
  );
}

export function getLinkHost(): string {
  return (
    trimUrl(process.env.EXPO_PUBLIC_LINK_HOST) ||
    trimUrl(extra().linkHost) ||
    'jobs.yourdomain.com'
  );
}
