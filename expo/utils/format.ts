/** Formats a kg value for display: 4 → "4", 4.5 → "4,5" (Ukrainian decimal comma). */
export function formatKg(value: number): string {
  const abs = Math.abs(value);
  const fixed = abs.toFixed(1);
  if (fixed.endsWith(".0")) {
    return fixed.slice(0, -2);
  }
  return fixed.replace(".", ",");
}
