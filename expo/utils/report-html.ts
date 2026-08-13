/**
 * GLP One — premium PDF report template.
 * Pure string builder: no React, no native modules, safe to unit-test.
 */
import type {
  DailyCheckin,
  PatientProfile,
  TherapyCycle,
  WeeklyCheckinFull,
} from "@/types/db";

const C = {
  navy: "#1B4F72",
  navyDeep: "#143A54",
  blue: "#2E86AB",
  teal: "#25B79C",
  tealDeep: "#159B84",
  mint: "#E9F6F2",
  gold: "#B08322",
  ink: "#16232E",
  sub: "#647685",
  paper: "#F3F6F8",
  hairline: "#E9EEF2",
} as const;

const MONTHS_GEN = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
] as const;

/** Escapes user-supplied text before it lands in the HTML template. */
function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "2026-08-12" → "12 серпня 2026" */
function longDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso.length < 10) return "—";
  const [y, m, d] = iso.split("-");
  const idx = Math.min(Math.max(parseInt(m ?? "1", 10) - 1, 0), 11);
  return `${parseInt(d ?? "1", 10)} ${MONTHS_GEN[idx]} ${y ?? ""}`;
}

/** "2026-08-12" → "12.08" */
function shortDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso.length < 10) return "—";
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const fixed = value.toFixed(digits);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed.replace(".", ",");
}

function ageFrom(dob: string | null): string {
  if (dob === null || dob.length < 10) return "—";
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const before =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (before) age -= 1;
  return `${age} р.`;
}

/** Inline SVG weight line chart with gradient area fill and value labels. */
function weightChartSvg(points: { label: string; value: number }[]): string {
  if (points.length === 0) {
    return `<div class="empty">Дані про вагу відсутні</div>`;
  }

  const W = 680;
  const H = 220;
  const PADL = 46;
  const PADR = 22;
  const PADT = 26;
  const PADB = 34;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 2;
    max += 2;
  }
  const pad = (max - min) * 0.18;
  min -= pad;
  max += pad;

  const xFor = (i: number): number =>
    points.length === 1
      ? (PADL + (W - PADR)) / 2
      : PADL + (i * (W - PADL - PADR)) / (points.length - 1);
  const yFor = (v: number): number =>
    H - PADB - ((v - min) / (max - min)) * (H - PADT - PADB);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
    .join(" ");

  const area =
    points.length > 1
      ? `${line} L ${xFor(points.length - 1).toFixed(1)} ${H - PADB} L ${xFor(0).toFixed(1)} ${H - PADB} Z`
      : "";

  const gridCount = 4;
  const grid = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = min + ((max - min) * i) / gridCount;
    const y = yFor(v);
    return `<line x1="${PADL}" y1="${y.toFixed(1)}" x2="${W - PADR}" y2="${y.toFixed(1)}" stroke="${C.hairline}" stroke-width="1"/>
      <text x="${PADL - 10}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" class="axis">${num(v, 0)}</text>`;
  }).join("");

  const dots = points
    .map((p, i) => {
      const cx = xFor(i);
      const cy = yFor(p.value);
      const isLast = i === points.length - 1;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isLast ? 5.5 : 3.6}" fill="${isLast ? C.tealDeep : "#FFFFFF"}" stroke="${C.tealDeep}" stroke-width="2"/>
        <text x="${cx.toFixed(1)}" y="${(cy - 13).toFixed(1)}" text-anchor="middle" class="dotval">${num(p.value)}</text>`;
    })
    .join("");

  const labels = points
    .map(
      (p, i) =>
        `<text x="${xFor(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="axis">${esc(p.label)}</text>`,
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${C.teal}" stop-opacity="0.26"/>
        <stop offset="1" stop-color="${C.teal}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${C.navy}"/>
        <stop offset="1" stop-color="${C.teal}"/>
      </linearGradient>
    </defs>
    ${grid}
    ${area.length > 0 ? `<path d="${area}" fill="url(#areaGrad)"/>` : ""}
    ${points.length > 1 ? `<path d="${line}" fill="none" stroke="url(#lineGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    ${dots}
    ${labels}
  </svg>`;
}

/** Progress ring showing how much of the goal has been achieved. */
function goalRingSvg(percent: number): string {
  const size = 118;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(percent, 0), 1);
  const dash = circ * clamped;

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <defs>
      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${C.navy}"/>
        <stop offset="1" stop-color="${C.teal}"/>
      </linearGradient>
    </defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.hairline}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="${size / 2}" y="${size / 2 + 3}" text-anchor="middle" class="ringnum">${Math.round(clamped * 100)}%</text>
    <text x="${size / 2}" y="${size / 2 + 20}" text-anchor="middle" class="ringcap">до цілі</text>
  </svg>`;
}

/** Horizontal comparison bars for body measurements (start vs latest). */
function measureBars(
  rows: { label: string; first: number | null; last: number | null }[],
): string {
  const usable = rows.filter((r) => r.last !== null);
  if (usable.length === 0) {
    return `<div class="empty">Замірів ще немає</div>`;
  }

  const maxVal = Math.max(
    ...usable.flatMap((r) => [r.first ?? 0, r.last ?? 0]),
    1,
  );

  return usable
    .map((r) => {
      const firstPct = ((r.first ?? 0) / maxVal) * 100;
      const lastPct = ((r.last ?? 0) / maxVal) * 100;
      const diff =
        r.first !== null && r.last !== null ? r.last - r.first : null;
      const diffTxt =
        diff === null ? "" : `${diff > 0 ? "+" : ""}${num(diff)} см`;
      const diffCls = diff !== null && diff < 0 ? "pos" : "neu";

      return `<div class="mrow">
        <div class="mlabel">${esc(r.label)}</div>
        <div class="mbars">
          <div class="mtrack"><div class="mfill start" style="width:${firstPct.toFixed(1)}%"></div></div>
          <div class="mtrack"><div class="mfill now" style="width:${lastPct.toFixed(1)}%"></div></div>
        </div>
        <div class="mvals">
          <span class="mstart">${num(r.first)}</span>
          <span class="marrow">→</span>
          <span class="mnow">${num(r.last)} см</span>
          <span class="mdiff ${diffCls}">${diffTxt}</span>
        </div>
      </div>`;
    })
    .join("");
}

export interface ReportInput {
  patient: PatientProfile;
  cycle: TherapyCycle | null;
  weekly: WeeklyCheckinFull[];
  daily: DailyCheckin[];
  doctorName: string;
  doctorSpecialization: string | null;
  today: string;
  cycleDay: number | null;
  totalDays: number | null;
}

/** Builds the full premium A4 report as an HTML string for expo-print. */
export function buildReportHtml(input: ReportInput): string {
  const {
    patient,
    cycle,
    weekly,
    daily,
    doctorName,
    doctorSpecialization,
    today,
    cycleDay,
    totalDays,
  } = input;

  const weighed = weekly.filter((w) => w.weight_kg !== null);
  const startWeight = cycle?.goal_start ?? weighed[0]?.weight_kg ?? null;
  const lastWeight =
    [...weighed].reverse()[0]?.weight_kg ?? startWeight ?? null;
  const target = cycle?.goal_target ?? null;
  const delta =
    startWeight !== null && lastWeight !== null ? lastWeight - startWeight : null;

  const goalPct =
    startWeight !== null && lastWeight !== null && target !== null && startWeight !== target
      ? (startWeight - lastWeight) / (startWeight - target)
      : 0;

  const chartPoints: { label: string; value: number }[] = [];
  if (cycle?.goal_start != null && cycle.start_date != null) {
    chartPoints.push({ label: shortDate(cycle.start_date), value: cycle.goal_start });
  }
  weighed.forEach((w) =>
    chartPoints.push({
      label: shortDate(w.checkin_date),
      value: w.weight_kg as number,
    }),
  );

  const firstW = weekly[0] ?? null;
  const lastW = [...weekly].reverse()[0] ?? null;

  const measurements = measureBars([
    { label: "Талія", first: firstW?.waist_cm ?? null, last: lastW?.waist_cm ?? null },
    { label: "Стегна", first: firstW?.hips_cm ?? null, last: lastW?.hips_cm ?? null },
    { label: "Живіт", first: firstW?.abdomen_cm ?? null, last: lastW?.abdomen_cm ?? null },
  ]);

  const weeklyRows =
    weekly.length === 0
      ? `<tr><td colspan="8" class="tempty">Щотижневих чек-інів ще немає</td></tr>`
      : [...weekly]
          .reverse()
          .map(
            (w) => `<tr>
              <td class="tdate">${longDate(w.checkin_date)}</td>
              <td class="tnum">${w.week_number ?? "—"}</td>
              <td class="tnum strong">${num(w.weight_kg)}</td>
              <td class="tnum">${num(w.waist_cm)}</td>
              <td class="tnum">${num(w.hips_cm)}</td>
              <td class="tnum">${num(w.abdomen_cm)}</td>
              <td class="tnum">${w.wellbeing ?? "—"} / ${w.energy ?? "—"}</td>
              <td class="tsym">${esc((w.symptoms ?? []).join(", ")) || "—"}</td>
            </tr>`,
          )
          .join("");

  const dailyRows =
    daily.length === 0
      ? `<tr><td colspan="6" class="tempty">Щоденних чек-інів ще немає</td></tr>`
      : daily
          .map((d) => {
            const flags = [
              d.nausea === true ? "нудота" : null,
              d.weakness === true ? "слабкість" : null,
            ].filter((f): f is string => f !== null);
            return `<tr>
              <td class="tdate">${longDate(d.checkin_date)}</td>
              <td class="tnum">${d.wellbeing ?? "—"}</td>
              <td class="tnum">${d.appetite ?? "—"}</td>
              <td class="tnum">${d.energy ?? "—"}</td>
              <td class="tnum">${d.sleep ?? "—"}</td>
              <td class="tsym">${flags.length > 0 ? esc(flags.join(", ")) : "—"}</td>
            </tr>`;
          })
          .join("");

  const initials = `${(patient.first_name ?? "?").charAt(0)}${(patient.last_name ?? "").charAt(0)}`.toUpperCase();

  const deltaCls = delta !== null && delta < 0 ? "kpi-pos" : "kpi-neu";
  const deltaTxt = delta === null ? "—" : `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))}`;

  return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="utf-8"/>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm 13mm; }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${C.ink};
    font-size: 10.5pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .brandbar { height: 5px; background: linear-gradient(90deg, ${C.navy} 0%, ${C.blue} 55%, ${C.teal} 100%); border-radius: 3px; }

  .masthead { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; padding-bottom: 14px; border-bottom: 1px solid ${C.hairline}; }
  .logo { font-size: 22pt; font-weight: 700; letter-spacing: -0.4px; color: ${C.navyDeep}; }
  .logo span { color: ${C.teal}; }
  .doctype { font-size: 8pt; letter-spacing: 2.4px; text-transform: uppercase; color: ${C.sub}; margin-top: 2px; }
  .issued { text-align: right; font-size: 8.5pt; color: ${C.sub}; line-height: 1.6; }
  .issued b { color: ${C.ink}; font-weight: 600; }

  .patient { display: flex; align-items: center; gap: 16px; margin: 20px 0 6px; }
  .avatar { width: 54px; height: 54px; border-radius: 27px; background: ${C.mint}; color: ${C.tealDeep}; font-size: 17pt; font-weight: 700; display: flex; align-items: center; justify-content: center; letter-spacing: 0.5px; }
  .pname { font-size: 19pt; font-weight: 700; color: ${C.navyDeep}; letter-spacing: -0.3px; }
  .pmeta { font-size: 9pt; color: ${C.sub}; margin-top: 3px; }

  h2 { font-size: 8.5pt; letter-spacing: 2px; text-transform: uppercase; color: ${C.sub}; font-weight: 600; margin: 22px 0 9px; }

  .cyclecard { background: ${C.paper}; border: 1px solid ${C.hairline}; border-radius: 12px; padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; gap: 20px; }
  .cyclename { font-size: 13pt; font-weight: 700; color: ${C.navyDeep}; }
  .cyclesub { font-size: 9pt; color: ${C.sub}; margin-top: 4px; }
  .cycleday { font-size: 9pt; color: ${C.gold}; font-weight: 600; margin-top: 6px; }
  .track { height: 7px; background: #FFFFFF; border: 1px solid ${C.hairline}; border-radius: 4px; overflow: hidden; margin-top: 9px; width: 260px; }
  .fill { height: 100%; background: linear-gradient(90deg, ${C.navy}, ${C.teal}); }

  .kpis { display: flex; gap: 10px; margin-top: 12px; }
  .kpi { flex: 1; border: 1px solid ${C.hairline}; border-radius: 12px; padding: 13px 14px; background: #FFFFFF; }
  .kpi-label { font-size: 7.5pt; letter-spacing: 1.4px; text-transform: uppercase; color: ${C.sub}; }
  .kpi-value { font-size: 20pt; font-weight: 700; color: ${C.navyDeep}; margin-top: 5px; letter-spacing: -0.5px; }
  .kpi-unit { font-size: 9pt; font-weight: 500; color: ${C.sub}; margin-left: 3px; }
  .kpi-pos .kpi-value { color: ${C.tealDeep}; }
  .kpi-neu .kpi-value { color: ${C.navyDeep}; }

  .panel { border: 1px solid ${C.hairline}; border-radius: 12px; padding: 16px 18px; background: #FFFFFF; }
  .chartrow { display: flex; gap: 18px; align-items: center; }
  .chartmain { flex: 1; }
  .ringbox { text-align: center; padding-left: 6px; border-left: 1px solid ${C.hairline}; }
  .ringnum { font-size: 17px; font-weight: 700; fill: ${C.navyDeep}; }
  .ringcap { font-size: 8px; fill: ${C.sub}; letter-spacing: 0.6px; }
  .axis { font-size: 9px; fill: ${C.sub}; }
  .dotval { font-size: 9.5px; font-weight: 700; fill: ${C.navyDeep}; }

  .mrow { display: flex; align-items: center; gap: 14px; padding: 9px 0; border-bottom: 1px solid ${C.hairline}; }
  .mrow:last-child { border-bottom: none; }
  .mlabel { width: 70px; font-size: 9.5pt; font-weight: 600; color: ${C.ink}; }
  .mbars { flex: 1; }
  .mtrack { height: 7px; background: ${C.paper}; border-radius: 4px; overflow: hidden; margin: 3px 0; }
  .mfill { height: 100%; border-radius: 4px; }
  .mfill.start { background: #C7D3DC; }
  .mfill.now { background: linear-gradient(90deg, ${C.navy}, ${C.teal}); }
  .mvals { width: 190px; text-align: right; font-size: 9pt; }
  .mstart { color: ${C.sub}; }
  .marrow { color: ${C.sub}; margin: 0 4px; }
  .mnow { font-weight: 700; color: ${C.navyDeep}; }
  .mdiff { margin-left: 8px; font-weight: 600; font-size: 8.5pt; }
  .mdiff.pos { color: ${C.tealDeep}; }
  .mdiff.neu { color: ${C.sub}; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 4px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: ${C.navyDeep}; color: #FFFFFF; font-size: 7.5pt; letter-spacing: 1px; text-transform: uppercase; font-weight: 600; padding: 8px 9px; text-align: left; }
  th:first-child { border-radius: 8px 0 0 0; }
  th:last-child { border-radius: 0 8px 0 0; }
  td { padding: 8px 9px; border-bottom: 1px solid ${C.hairline}; }
  tbody tr:nth-child(even) { background: #FAFCFD; }
  .tdate { color: ${C.ink}; font-weight: 500; white-space: nowrap; }
  .tnum { text-align: center; color: ${C.sub}; }
  .tnum.strong { color: ${C.navyDeep}; font-weight: 700; }
  .tsym { color: ${C.sub}; font-size: 8.5pt; }
  .tempty { text-align: center; color: ${C.sub}; padding: 18px; font-style: italic; }

  .empty { color: ${C.sub}; font-size: 9.5pt; font-style: italic; padding: 14px 0; text-align: center; }

  .signature { margin-top: 34px; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid; }
  .sigline { width: 210px; border-top: 1px solid ${C.ink}; padding-top: 6px; font-size: 8.5pt; color: ${C.sub}; }
  .signame { font-size: 10pt; font-weight: 700; color: ${C.navyDeep}; }

  .footnote { margin-top: 22px; padding-top: 12px; border-top: 1px solid ${C.hairline}; font-size: 7.5pt; color: ${C.sub}; line-height: 1.6; }

  h2 { page-break-after: avoid; break-after: avoid; }
  .panel, .cyclecard, .kpis { page-break-inside: avoid; break-inside: avoid; }
  table { page-break-inside: auto; }
</style></head>
<body>

  <div class="brandbar"></div>

  <div class="masthead">
    <div>
      <div class="logo">GLP<span> One</span></div>
      <div class="doctype">Звіт супроводу терапії</div>
    </div>
    <div class="issued">
      Сформовано<br/>
      <b>${longDate(today)}</b><br/>
      ${esc(doctorName)}
    </div>
  </div>

  <div class="patient">
    <div class="avatar">${esc(initials)}</div>
    <div>
      <div class="pname">${esc(patient.first_name)} ${esc(patient.last_name)}</div>
      <div class="pmeta">${[
        patient.date_of_birth !== null ? `${longDate(patient.date_of_birth)} · ${ageFrom(patient.date_of_birth)}` : null,
        patient.city !== null && patient.city !== undefined && patient.city.length > 0 ? esc(patient.city) : null,
      ].filter((x) => x !== null).join(" · ") || "—"}</div>
    </div>
  </div>

  <h2>Активний цикл</h2>
  ${
    cycle !== null
      ? `<div class="cyclecard">
          <div>
            <div class="cyclename">${esc(cycle.protocol_name) || "Без назви"}</div>
            <div class="cyclesub">${longDate(cycle.start_date)} — ${longDate(cycle.expected_end)}</div>
            <div class="cycleday">День ${cycleDay ?? "—"} з ${totalDays ?? "—"}</div>
            <div class="track"><div class="fill" style="width:${
              cycleDay !== null && totalDays !== null
                ? Math.min(Math.max((cycleDay / totalDays) * 100, 2), 100).toFixed(1)
                : "2"
            }%"></div></div>
          </div>
          <div class="ringbox">${goalRingSvg(goalPct)}</div>
        </div>`
      : `<div class="panel"><div class="empty">Активного циклу немає</div></div>`
  }

  <h2>Ключові показники</h2>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Старт</div><div class="kpi-value">${num(startWeight)}<span class="kpi-unit">кг</span></div></div>
    <div class="kpi"><div class="kpi-label">Поточна</div><div class="kpi-value">${num(lastWeight)}<span class="kpi-unit">кг</span></div></div>
    <div class="kpi ${deltaCls}"><div class="kpi-label">Зміна</div><div class="kpi-value">${deltaTxt}<span class="kpi-unit">кг</span></div></div>
    <div class="kpi"><div class="kpi-label">Ціль</div><div class="kpi-value">${num(target)}<span class="kpi-unit">кг</span></div></div>
  </div>

  <h2>Динаміка ваги</h2>
  <div class="panel">
    <div class="chartrow"><div class="chartmain">${weightChartSvg(chartPoints)}</div></div>
  </div>

  <h2>Заміри тіла · старт → поточні</h2>
  <div class="panel">${measurements}</div>

  <h2>Щотижневі чек-іни</h2>
  <table>
    <thead><tr>
      <th>Дата</th><th>Тиж.</th><th>Вага, кг</th><th>Талія</th><th>Стегна</th><th>Живіт</th><th>Самоп./Енерг.</th><th>Симптоми</th>
    </tr></thead>
    <tbody>${weeklyRows}</tbody>
  </table>

  <h2>Щоденні чек-іни · останні ${daily.length}</h2>
  <table>
    <thead><tr>
      <th>Дата</th><th>Самопочуття</th><th>Апетит</th><th>Енергія</th><th>Сон</th><th>Відмітки</th>
    </tr></thead>
    <tbody>${dailyRows}</tbody>
  </table>

  <div class="signature">
    <div class="sigline">
      <div class="signame">${esc(doctorName)}</div>
      ${esc(doctorSpecialization) || "Лікуючий лікар"}
    </div>
    <div class="sigline" style="text-align:right">Підпис · дата</div>
  </div>

  <div class="footnote">
    Документ сформовано автоматично в застосунку GLP One на основі даних самоконтролю пацієнта.
    Містить конфіденційну медичну інформацію та призначений виключно для лікуючого лікаря і пацієнта.
    Не є медичним висновком і не замінює очну консультацію.
  </div>

</body></html>`;
}
