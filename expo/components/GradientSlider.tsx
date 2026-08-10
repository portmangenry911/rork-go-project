import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import { PanResponder, Platform, StyleSheet, View } from "react-native";

import { colors, cardShadow } from "@/constants/theme";

const THUMB_SIZE = 30;

interface GradientSliderProps {
  value: number;
  onChange: (value: number) => void;
  testID?: string;
}

/** 1–10 slider with navy→teal gradient fill and a white thumb with teal border. */
export default function GradientSlider({
  value,
  onChange,
  testID,
}: GradientSliderProps) {
  const [trackWidth, setTrackWidth] = useState<number>(0);
  const trackWidthRef = useRef<number>(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef<number>(value);
  valueRef.current = value;

  const updateFromX = useCallback((x: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return;
    const ratio = Math.min(Math.max(x / w, 0), 1);
    const next = Math.round(ratio * 9) + 1;
    if (next !== valueRef.current) {
      onChangeRef.current(next);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => updateFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => updateFromX(evt.nativeEvent.locationX),
    }),
  ).current;

  const ratio = (value - 1) / 9;
  const thumbLeft = Math.max(
    0,
    Math.min(ratio * trackWidth - THUMB_SIZE / 2, trackWidth - THUMB_SIZE),
  );
  const fillWidth = Math.max(ratio * trackWidth, THUMB_SIZE / 2);

  return (
    <View
      style={styles.hitArea}
      onLayout={(e) => {
        setTrackWidth(e.nativeEvent.layout.width);
        trackWidthRef.current = e.nativeEvent.layout.width;
      }}
      {...panResponder.panHandlers}
      testID={testID}
    >
      <View style={styles.track} pointerEvents="none">
        <LinearGradient
          colors={[colors.blue, colors.teal]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: fillWidth }]}
        />
      </View>
      {trackWidth > 0 && (
        <View style={[styles.thumb, { left: thumbLeft }]} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    height: 44,
    justifyContent: "center",
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  fill: {
    height: 10,
    borderRadius: 5,
  },
  thumb: {
    position: "absolute",
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: colors.teal,
    ...cardShadow,
  },
});
