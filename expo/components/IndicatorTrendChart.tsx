import React from "react";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { colors } from "@/constants/theme";

interface IndicatorTrendChartProps {
  /** Oldest first. */
  points: { value: number }[];
  width: number;
}

/** Small line chart for a single lab indicator's history, oldest to newest. */
export default function IndicatorTrendChart({
  points,
  width,
}: IndicatorTrendChartProps) {
  const H = 110;
  const PADX = 8;
  const PADT = 14;
  const PADB = 10;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  min -= range * 0.12;
  max += range * 0.12;

  const xFor = (i: number): number =>
    points.length === 1
      ? width / 2
      : PADX + (i * (width - 2 * PADX)) / (points.length - 1);
  const yFor = (v: number): number =>
    H - PADB - ((v - min) / (max - min)) * (H - PADT - PADB);

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`,
    )
    .join(" ");

  const areaPath =
    points.length > 1
      ? `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${H - PADB} L ${xFor(0).toFixed(1)} ${H - PADB} Z`
      : null;

  const last = points[points.length - 1];

  return (
    <Svg width={width} height={H}>
      <Defs>
        <SvgLinearGradient id="indicatorAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.teal} stopOpacity={0.16} />
          <Stop offset="1" stopColor={colors.teal} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Line
        x1={PADX}
        y1={H - PADB}
        x2={width - PADX}
        y2={H - PADB}
        stroke={colors.hairline}
        strokeWidth={1}
      />
      {areaPath !== null && (
        <Path d={areaPath} fill="url(#indicatorAreaGrad)" />
      )}
      {points.length > 1 && (
        <Path
          d={linePath}
          stroke={colors.teal}
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {last !== undefined && (
        <Circle
          cx={xFor(points.length - 1)}
          cy={yFor(last.value)}
          r={4.5}
          fill={colors.tealDeep}
        />
      )}
    </Svg>
  );
}
