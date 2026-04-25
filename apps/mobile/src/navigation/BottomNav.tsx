import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ScheduleScreen } from '../screens/ScheduleScreen';
import { CameraEntryScreen } from '../screens/CameraEntryScreen';
import { theme } from '../theme';

const Tab = createBottomTabNavigator();

export function BottomNav() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTitleStyle: { color: theme.colors.text },
        tabBarStyle: {
          backgroundColor: theme.colors.bgElevated,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>•</Text>,
        }}
      />
      <Tab.Screen
        name="CameraEntry"
        component={CameraEntryScreen}
        options={{
          title: 'Add',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>+</Text>,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>•</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
