import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useDoctorHome } from "@/hooks/useDoctorHome";
import type { TherapyCycle } from "@/types/db";
import { daysSince } from "@/utils/dates";

export interface DoctorPatientItem {
  patientId: string;
  firstName: string;
  lastName: string;
  cycle: TherapyCycle | null;
  /** Current day within the cycle (1-based), null if no cycle. */
  cycleDay: number | null;
  /** Total cycle days, null if no expected_end. */
  cycleTotalDays: number | null;
  /** latest weight − goal_start (negative = lost weight). */
  weightDelta: number | null;
  /** Most recent check-in date (daily or weekly), null if none. */
  lastCheckinDate: string | null;
  /** True when no check-in for 3+ days (needs attention). */
  needsAttention: boolean;
}

/** Loads the doctor's active patients enriched with cycle + check-in data. */
export function useDoctorPatients() {
  const { profile, relations, isLoading: isHomeLoading } = useDoctorHome();
  const doctorId = profile?.id ?? null;

  const patientIds = relations
    .map((r) => r.patient?.id ?? null)
    .filter((id): id is string => id !== null);

  const enrichedQuery = useQuery({
    queryKey: ["doctor-patients-enriched", doctorId, patientIds.join(",")],
    enabled: doctorId !== null && !isHomeLoading,
    queryFn: async (): Promise<DoctorPatientItem[]> => {
      if (patientIds.length === 0) return [];

      const { data: cyclesData, error: cyclesError } = await supabase
        .from("therapy_cycles")
        .select(
          "id, doctor_id, patient_id, protocol_name, goal_type, goal_start, goal_target, goal_unit, goal_waist_cm, goal_hips_cm, goal_abdomen_cm, start_date, expected_end, status",
        )
        .eq("doctor_id", doctorId as string)
        .eq("status", "active")
        .in("patient_id", patientIds);
      if (cyclesError) throw cyclesError;
      const cycles = (cyclesData ?? []) as unknown as TherapyCycle[];
      const cycleIds = cycles.map((c) => c.id);

      let weeklyRows: {
        therapy_cycle_id: string;
        checkin_date: string | null;
        weight_kg: number | null;
        week_number: number | null;
      }[] = [];
      let dailyRows: { therapy_cycle_id: string; checkin_date: string | null }[] =
        [];

      if (cycleIds.length > 0) {
        const [weeklyRes, dailyRes] = await Promise.all([
          supabase
            .from("weekly_checkins")
            .select("therapy_cycle_id, checkin_date, weight_kg, week_number")
            .in("therapy_cycle_id", cycleIds)
            .order("checkin_date", { ascending: false }),
          supabase
            .from("daily_checkins")
            .select("therapy_cycle_id, checkin_date")
            .in("therapy_cycle_id", cycleIds)
            .order("checkin_date", { ascending: false }),
        ]);
        if (weeklyRes.error) throw weeklyRes.error;
        if (dailyRes.error) throw dailyRes.error;
        weeklyRows = (weeklyRes.data ?? []) as typeof weeklyRows;
        dailyRows = (dailyRes.data ?? []) as typeof dailyRows;
      }

      return relations
        .filter((r) => r.patient !== null)
        .map((r) => {
          const patient = r.patient as {
            id: string;
            first_name: string;
            last_name: string;
          };
          const cycle = cycles.find((c) => c.patient_id === patient.id) ?? null;

          let cycleDay: number | null = null;
          let cycleTotalDays: number | null = null;
          if (cycle?.start_date != null) {
            cycleDay = daysSince(cycle.start_date) + 1;
            if (cycle.expected_end != null) {
              cycleTotalDays = Math.max(
                Math.round(
                  (new Date(`${cycle.expected_end}T00:00:00`).getTime() -
                    new Date(`${cycle.start_date}T00:00:00`).getTime()) /
                    86400000,
                ),
                1,
              );
            }
          }

          const cycleWeekly = weeklyRows.filter(
            (w) => cycle !== null && w.therapy_cycle_id === cycle.id,
          );
          const latestWeight =
            cycleWeekly.find((w) => w.weight_kg !== null)?.weight_kg ?? null;
          const weightDelta =
            latestWeight !== null && cycle?.goal_start != null
              ? latestWeight - cycle.goal_start
              : null;

          const weeklyDate = cycleWeekly[0]?.checkin_date ?? null;
          const dailyDate =
            dailyRows.find(
              (d) => cycle !== null && d.therapy_cycle_id === cycle.id,
            )?.checkin_date ?? null;
          let lastCheckinDate: string | null = null;
          if (weeklyDate !== null && dailyDate !== null) {
            lastCheckinDate = weeklyDate > dailyDate ? weeklyDate : dailyDate;
          } else {
            lastCheckinDate = weeklyDate ?? dailyDate;
          }

          const needsAttention =
            cycle !== null &&
            (lastCheckinDate === null || daysSince(lastCheckinDate) >= 3);

          return {
            patientId: patient.id,
            firstName: patient.first_name,
            lastName: patient.last_name,
            cycle,
            cycleDay,
            cycleTotalDays,
            weightDelta,
            lastCheckinDate,
            needsAttention,
          };
        });
    },
  });

  return {
    patients: enrichedQuery.data ?? [],
    isLoading: isHomeLoading || (doctorId !== null && enrichedQuery.isPending),
    isError: enrichedQuery.isError,
  };
}
