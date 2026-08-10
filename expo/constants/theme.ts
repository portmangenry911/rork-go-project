/**
 * GLP One design tokens — navy/teal medical aesthetic.
 * Signature navy→teal gradient is used ONLY on the progress ring and progress bars.
 */
export const colors = {
  navy: "#1B4F72",
  navyDeep: "#143A54",
  blue: "#2E86AB",
  teal: "#25B79C",
  tealDeep: "#159B84",
  mint: "#E9F6F2",
  amber: "#D98324",
  gold: "#B08322",
  goldTint: "#FBF3E1",
  ink: "#16232E",
  sub: "#647685",
  paper: "#F3F6F8",
  card: "#FFFFFF",
  hairline: "#E9EEF2",
} as const;

export const fonts = {
  serif: "Fraunces_600SemiBold",
  regular: "HankenGrotesk_400Regular",
  medium: "HankenGrotesk_500Medium",
  semibold: "HankenGrotesk_600SemiBold",
  bold: "HankenGrotesk_700Bold",
  extrabold: "HankenGrotesk_800ExtraBold",
} as const;

export const radius = {
  card: 20,
  button: 14,
  pill: 999,
} as const;

export const cardShadow = {
  shadowColor: "#16232E",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 20,
  elevation: 3,
} as const;

export const softShadow = {
  shadowColor: "#16232E",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.04,
  shadowRadius: 10,
  elevation: 2,
} as const;
