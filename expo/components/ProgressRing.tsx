import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";

import { colors } from "@/constants/theme";

interface ProgressRingProps {
  size: number;
  strokeWidth: number;
  /** 0..1 */
  progress: number;
  children?: React.ReactNode;
}

/** Circular progress ring with the signature navy→teal gradient stroke. */
export default function ProgressRing({
  size,
  strokeWidth,
  progress,
  children,
}: ProgressRingProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const visible = Math.max(clamped, 0.015);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="1" stopColor={colors.teal} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.hairline}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference * visible} ${circumference}`}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
