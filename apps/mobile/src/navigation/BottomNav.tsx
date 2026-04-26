import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
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
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              color={color}
              size={size ?? 22}
            />
          ),
        }}
      />
      <Tab.Screen
        name="CameraEntry"
        component={CameraEntryScreen}
        options={{
          title: 'Your Equipment',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? 'apps' : 'apps-outline'}
              color={color}
              size={size ?? 22}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? 'list' : 'list-outline'}
              color={color}
              size={size ?? 22}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
