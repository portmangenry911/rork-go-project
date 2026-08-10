const MONTH_ABBREV = [
  "СІЧ",
  "ЛЮТ",
  "БЕР",
  "КВІ",
  "ТРА",
  "ЧЕР",
  "ЛИП",
  "СЕР",
  "ВЕР",
  "ЖОВ",
  "ЛИС",
  "ГРУ",
] as const;

const MONTH_GENITIVE = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

/** Returns today's date as YYYY-MM-DD in local time. */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses YYYY-MM-DD into day number and Ukrainian month abbreviation. */
export function dateParts(iso: string): { day: string; month: string } {
  const [, m, d] = iso.split("-");
  const monthIndex = Math.min(Math.max(parseInt(m ?? "1", 10) - 1, 0), 11);
  return {
    day: String(parseInt(d ?? "1", 10)),
    month: MONTH_ABBREV[monthIndex],
  };
}

/** Formats YYYY-MM-DD as "10 серпня 2026". */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-");
  const monthIndex = Math.min(Math.max(parseInt(m ?? "1", 10) - 1, 0), 11);
  return `${parseInt(d ?? "1", 10)} ${MONTH_GENITIVE[monthIndex]} ${y ?? ""}`;
}

/** Formats YYYY-MM-DD as short "10 сер". */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  const monthIndex = Math.min(Math.max(parseInt(m ?? "1", 10) - 1, 0), 11);
  return `${parseInt(d ?? "1", 10)} ${MONTH_ABBREV[monthIndex].toLowerCase()}`;
}

/** Days elapsed since an ISO date (0 for today). */
export function daysSince(iso: string): number {
  const start = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const startMidnight = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  ).getTime();
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.max(Math.round((nowMidnight - startMidnight) / 86400000), 0);
}
