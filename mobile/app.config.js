const linkHost = process.env.EXPO_PUBLIC_LINK_HOST || 'jobs.yourdomain.com';
// Store listing / App Review links — leave empty until live HTTPS pages exist.
// Examples once published: https://squarethisup.com/privacy , https://squarethisup.com
const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || '';
const supportUrl = process.env.EXPO_PUBLIC_SUPPORT_URL || '';

/** @type {import('expo/config').ExpoConfig} */
const expoConfig = {
  name: 'Square This Up',
  slug: 'square-this-up',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'squarethisup',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.squarethisup.app',
    infoPlist: {
      NSCameraUsageDescription: 'Square This Up uses the camera to capture jobsite photos.',
      NSPhotoLibraryUsageDescription: 'Square This Up uses your photo library to attach jobsite photos.',
    },
    // Universal Links: open https://{host}/register and /reset-password in the app when installed.
    associatedDomains: [`applinks:${linkHost}`],
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0504AA',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    package: 'com.squarethisup.app',
    predictiveBackGestureEnabled: false,
    permissions: ['CAMERA', 'READ_MEDIA_IMAGES'],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          { scheme: 'https', host: linkHost, pathPrefix: '/register' },
          { scheme: 'https', host: linkHost, pathPrefix: '/reset-password' },
        ],
      },
      {
        action: 'VIEW',
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          { scheme: 'squarethisup', pathPrefix: '/register' },
          { scheme: 'squarethisup', pathPrefix: '/reset-password' },
        ],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0504AA',
      },
    ],
    'expo-secure-store',
    'expo-image',
    'expo-sharing',
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Square This Up to attach jobsite photos from your library.',
        cameraPermission: 'Allow Square This Up to take jobsite photos.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      // Set after `eas init` / linking the project in Expo dashboard (human step).
      projectId: process.env.EAS_PROJECT_ID || undefined,
    },
    linkHost,
    privacyPolicyUrl,
    supportUrl,
  },
};

export default {
  expo: expoConfig,
};
