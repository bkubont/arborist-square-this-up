import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { BRAND_HEX } from '@/lib/brand';

function TabLabel({ label, color }: { label: string; color: ColorValue }) {
  return <Text style={{ fontSize: 11, fontWeight: '600', color }}>{label}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: BRAND_HEX.royalBlue,
        tabBarInactiveTintColor: '#888',
        headerTintColor: BRAND_HEX.royalBlue,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarLabel: ({ color }) => <TabLabel label="Jobs" color={color} />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarLabel: ({ color }) => <TabLabel label="Customers" color={color} />,
        }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: 'Money',
          tabBarLabel: ({ color }) => <TabLabel label="Money" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarLabel: ({ color }) => <TabLabel label="More" color={color} />,
        }}
      />
    </Tabs>
  );
}
