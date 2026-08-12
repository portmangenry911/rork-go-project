import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, fonts } from "@/constants/theme";

const MIN_KG = 30;
const MAX_KG = 300;
const PIXELS_PER_KG = 24;

interface WeightRulerProps {
  value: number;
  onChange: (value: number) => void;
  testID?: string;
}

/**
 * Horizontal drag-to-scrub weight ruler. Replaces the old +/- stepper
 * (which only moved weight by 0.1 kg per tap) with a continuous scroll —
 * drag left/right to adjust, snaps to the nearest 0.1 kg.
 */
export default function WeightRuler({ value, onChange, testID }: WeightRulerProps) {
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const scrollRef = useRef<ScrollView>(null);
  const hasInitialized = useRef<boolean>(false);
  const lastHapticKg = useRef<number>(Math.round(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let kg = MIN_KG; kg <= MAX_KG; kg += 1) {
      arr.push(kg);
    }
    return arr;
  }, []);

  const contentWidth = (MAX_KG - MIN_KG) * PIXELS_PER_KG;

  useEffect(() => {
    if (hasInitialized.current || containerWidth <= 0) return;
    hasInitialized.current = true;
    const x = Math.max(0, Math.min(value, MAX_KG) - MIN_KG) * PIXELS_PER_KG;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x, animated: false });
    });
  }, [containerWidth, value]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const raw = MIN_KG + offsetX / PIXELS_PER_KG;
    const clamped = Math.max(MIN_KG, Math.min(MAX_KG, raw));
    const rounded = Math.round(clamped * 10) / 10;
    if (rounded !== value) {
      onChangeRef.current(rounded);
      const wholeKg = Math.round(rounded);
      if (wholeKg !== lastHapticKg.current) {
        lastHapticKg.current = wholeKg;
        if (Platform.OS !== "web") {
          Haptics.selectionAsync();
        }
      }
    }
  };

  return (
    <View
      testID={testID}
      style={styles.wrap}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.centerLine} pointerEvents="none" />
      {containerWidth > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: containerWidth / 2,
            width: contentWidth + containerWidth,
          }}
        >
          {ticks.map((kg) => {
            const isMajor = kg % 5 === 0;
            return (
              <View key={kg} style={styles.tickWrap}>
                <View
                  style={[
                    styles.tick,
                    isMajor ? styles.tickMajor : styles.tickMinor,
                  ]}
                />
                {isMajor && <Text style={styles.tickLabel}>{kg}</Text>}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 68,
    justifyContent: "flex-end",
  },
  centerLine: {
    position: "absolute",
    top: 0,
    left: "50%",
    marginLeft: -1,
    width: 2,
    height: 34,
    backgroundColor: colors.tealDeep,
    borderRadius: 1,
  },
  tickWrap: {
    width: PIXELS_PER_KG,
    alignItems: "center",
  },
  tick: {
    width: 1.5,
    borderRadius: 1,
    backgroundColor: colors.hairline,
  },
  tickMinor: {
    height: 14,
  },
  tickMajor: {
    height: 24,
    backgroundColor: colors.sub,
  },
  tickLabel: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    color: colors.sub,
    marginTop: 4,
  },
});
