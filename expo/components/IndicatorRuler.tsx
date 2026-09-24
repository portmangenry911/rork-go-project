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

const PIXELS_PER_TICK = 22;

interface IndicatorRulerProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Smallest increment this indicator is recorded at (e.g. 0.1, 1, 5). */
  step: number;
  testID?: string;
}

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Picks a "nice" tick interval (a multiple of `step`) so roughly 8-10
 * labeled major ticks span the whole range, regardless of how wide it is
 * (HbA1c spans 12 units at 0.1 precision; creatinine spans 470 at 1).
 */
function niceMajorStep(range: number, step: number): number {
  const target = Math.max(range / 9, step);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const residual = target / magnitude;
  let niceResidual: number;
  if (residual < 1.5) niceResidual = 1;
  else if (residual < 3.5) niceResidual = 2;
  else if (residual < 7.5) niceResidual = 5;
  else niceResidual = 10;
  const nice = niceResidual * magnitude;
  const ticksInNice = Math.max(1, Math.round(nice / step));
  return ticksInNice * step;
}

/**
 * Horizontal drag-to-scrub ruler for a single lab indicator, generalizing
 * WeightRuler to an arbitrary min/max/step per indicator (e.g. HbA1c
 * 3.0-15.0 step 0.1 vs creatinine 30-500 step 1).
 */
export default function IndicatorRuler({
  value,
  onChange,
  min,
  max,
  step,
  testID,
}: IndicatorRulerProps) {
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const scrollRef = useRef<ScrollView>(null);
  const hasInitialized = useRef<boolean>(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const decimals = useMemo(() => decimalsOf(step), [step]);
  const tickCount = Math.max(1, Math.round((max - min) / step));
  const majorStep = useMemo(
    () => niceMajorStep(max - min, step),
    [max, min, step],
  );
  const lastHapticMajor = useRef<number>(
    Math.round((Math.max(min, Math.min(max, value)) - min) / majorStep),
  );

  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i <= tickCount; i += 1) {
      arr.push(roundTo(min + i * step, decimals));
    }
    return arr;
  }, [tickCount, min, step, decimals]);

  const contentWidth = tickCount * PIXELS_PER_TICK;

  useEffect(() => {
    if (hasInitialized.current || containerWidth <= 0) return;
    hasInitialized.current = true;
    const clamped = Math.max(min, Math.min(max, value));
    const x = ((clamped - min) / step) * PIXELS_PER_TICK;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x, animated: false });
    });
  }, [containerWidth, value, min, max, step]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const raw = min + (offsetX / PIXELS_PER_TICK) * step;
    const clamped = Math.max(min, Math.min(max, raw));
    const snapped = roundTo(
      min + Math.round((clamped - min) / step) * step,
      decimals,
    );
    if (snapped !== value) {
      onChangeRef.current(snapped);
      const majorIndex = Math.round((snapped - min) / majorStep);
      if (majorIndex !== lastHapticMajor.current) {
        lastHapticMajor.current = majorIndex;
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
          {ticks.map((tickValue) => {
            const stepsFromMin = Math.round((tickValue - min) / majorStep);
            const isMajor =
              Math.abs(stepsFromMin * majorStep - (tickValue - min)) <
              step / 2;
            return (
              <View key={tickValue} style={styles.tickWrap}>
                <View
                  style={[
                    styles.tick,
                    isMajor ? styles.tickMajor : styles.tickMinor,
                  ]}
                />
                {isMajor && (
                  <Text style={styles.tickLabel}>
                    {tickValue.toFixed(decimals)}
                  </Text>
                )}
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
    width: PIXELS_PER_TICK,
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
    fontSize: 10,
    color: colors.sub,
    marginTop: 4,
  },
});
