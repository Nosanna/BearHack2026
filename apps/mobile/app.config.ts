import { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Fixit Fred',
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
        'Fixit Fred uses the camera to identify appliances and verify repair steps.',
      NSPhotoLibraryUsageDescription:
        'Fixit Fred reads photos so you can pick existing images of your appliances.',
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
        cameraPermission: 'Allow Fixit Fred to access the camera.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Allow Fixit Fred to access your photos.',
      },
    ],
    'expo-secure-store',
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
    googleClientIdIos: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '',
    googleClientIdAndroid: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '',
    googleClientIdWeb: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '',
  },
};

export default config;
