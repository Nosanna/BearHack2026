import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { AuthProvider } from './src/auth/AuthProvider';
import { AppShell } from './src/navigation/AppShell';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function App() {
  React.useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7398/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '239de5' },
      body: JSON.stringify({
        sessionId: '239de5',
        runId: 'pre-fix',
        hypothesisId: 'H4',
        location: 'apps/mobile/App.tsx:startup',
        message: 'App mounted; expo constants snapshot',
        data: {
          appOwnership: Constants.appOwnership ?? null,
          expoConfigHostUri: (Constants.expoConfig as any)?.hostUri ?? null,
          easUpdateUrl: (Constants.expoConfig as any)?.updates?.url ?? null,
          apiUrlExtra: (Constants.expoConfig as any)?.extra?.apiUrl ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" />
            <AppShell />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
