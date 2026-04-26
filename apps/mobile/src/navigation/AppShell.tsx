import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { LoginScreen } from '../screens/LoginScreen';
import { ApplianceDetailScreen } from '../screens/ApplianceDetailScreen';
import { CameraScreen } from '../screens/CameraScreen';
import { ApplianceSaveScreen } from '../screens/ApplianceSaveScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { RoomDetailScreen } from '../screens/RoomDetailScreen';
import { BottomNav } from './BottomNav';
import { theme } from '../theme';

export type RootStackParamList = {
  Tabs: undefined;
  RoomDetail: { roomId: string };
  Camera: { mode: 'register' | 'repair-step'; sessionId?: string; roomId?: string };
  ApplianceDetail: { applianceId: string; taskId?: string; source?: 'home-upcoming' };
  ApplianceSave: {
    roomId: string;
    imageUrl: string;
    typeOptions: Array<{ type: string; confidence: number }>;
    suggested: {
      type: string;
      brand: string | null;
      model: string | null;
      confidence: number;
      categoryGuess?: string | null;
      broadCategory?: string | null;
    };
  };
  Assistant: { sessionId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppShell() {
  const { user, isHydrating } = useAuth();

  if (isHydrating) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!user) return <LoginScreen />;

  return (
    <NavigationContainer
      theme={{
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          background: theme.colors.bg,
          card: theme.colors.bgElevated,
          text: theme.colors.text,
          border: theme.colors.border,
          primary: theme.colors.accent,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={BottomNav} />
        <Stack.Screen
          name="RoomDetail"
          component={RoomDetailScreen}
          options={{ headerShown: true, title: 'Space' }}
        />
        <Stack.Screen
          name="ApplianceDetail"
          component={ApplianceDetailScreen}
          options={{ headerShown: true, title: 'Appliance' }}
        />
        <Stack.Screen
          name="Camera"
          component={CameraScreen}
          options={{ headerShown: true, title: 'Camera' }}
        />
        <Stack.Screen
          name="ApplianceSave"
          component={ApplianceSaveScreen}
          options={{ headerShown: true, title: 'Save appliance' }}
        />
        <Stack.Screen
          name="Assistant"
          component={AssistantScreen}
          options={{ headerShown: true, title: 'Repair' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
