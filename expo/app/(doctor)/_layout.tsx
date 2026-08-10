import { Tabs } from "expo-router";
import {
  CalendarDays,
  House,
  MessageCircle,
  UserRound,
  Users,
} from "lucide-react-native";
import React from "react";

import TabBarIcon from "@/components/TabBarIcon";
import { colors, fonts } from "@/constants/theme";

export default function DoctorTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.sub,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.hairline,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.semibold,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Головна",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon focused={focused}>
              <House size={22} color={color} strokeWidth={1.8} />
            </TabBarIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: "Пацієнти",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon focused={focused}>
              <Users size={22} color={color} strokeWidth={1.8} />
            </TabBarIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Календар",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon focused={focused}>
              <CalendarDays size={22} color={color} strokeWidth={1.8} />
            </TabBarIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Чат",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon focused={focused}>
              <MessageCircle size={22} color={color} strokeWidth={1.8} />
            </TabBarIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профіль",
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon focused={focused}>
              <UserRound size={22} color={color} strokeWidth={1.8} />
            </TabBarIcon>
          ),
        }}
      />
    </Tabs>
  );
}
