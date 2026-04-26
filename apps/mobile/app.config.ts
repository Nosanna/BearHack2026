import { ExpoConfig } from 'expo/config';

// NOTE: `slug`, `scheme`, `bundleIdentifier`, and `android.package` are kept as
// the original `fixit-fred` / `app.fixit.fred` values on purpose — the EAS
// project, signing keys, and any installs already keyed off them. The visible
// app name and all user-facing copy have been rebranded to "Home Hero".
const config: ExpoConfig = {
  name: 'Home Hero',
  slug: 'fixit-fred',
  scheme: 'fixitfred',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.fixit.fred',
    infoPlist: {
      NSCameraUsageDescription:
        'Home Hero uses the camera to identify equipment and verify repair steps.',
      NSPhotoLibraryUsageDescription:
        'Home Hero reads photos so you can pick existing images of your equipment.',
    },
  },
  android: {
    package: 'app.fixit.fred',
    permissions: ['CAMERA', 'READ_EXTERNAL_STORAGE'],
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Home Hero to access the camera.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Home Hero to access your photos.',
      },
    ],
    'expo-secure-store',
  ],
  extra: {
    eas: {
      projectId: 'fba5869d-9d87-4a5f-abfa-96d387f6b582',
    },
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
    googleClientIdIos: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '',
    googleClientIdAndroid: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '',
    googleClientIdWeb: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '',
  },
};

export default config;
