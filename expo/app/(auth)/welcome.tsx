import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";

import PrimaryButton from "@/components/PrimaryButton";
import { colors, fonts } from "@/constants/theme";

const RING_SIZE = 108;
const STROKE = 10;

function LogoRing() {
  const r = (RING_SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Defs>
        <SvgLinearGradient id="logoRing" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.navy} />
          <Stop offset="1" stopColor={colors.teal} />
        </SvgLinearGradient>
      </Defs>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={r}
        stroke={colors.hairline}
        strokeWidth={STROKE}
        fill="none"
      />
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={r}
        stroke="url(#logoRing)"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${c * 0.72} ${c}`}
        fill="none"
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 },
      ]}
      testID="welcome-screen"
    >
      <View style={styles.hero}>
        <LogoRing />
        <Text style={styles.appName}>GLP One</Text>
        <Text style={styles.tagline}>
          Терапія під наглядом лікаря — прозоро, спокійно, щотижня.
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          testID="welcome-sign-in"
          label="Увійти"
          onPress={() => router.push("/(auth)/sign-in")}
        />
        <PrimaryButton
          testID="welcome-sign-up"
          label="Зареєструватися"
          variant="outline"
          onPress={() => router.push("/(auth)/sign-up")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  appName: {
    fontFamily: fonts.serif,
    fontSize: 40,
    color: colors.ink,
    marginTop: 24,
  },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.sub,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  actions: {
    gap: 12,
  },
});
