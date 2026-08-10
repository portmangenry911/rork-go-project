import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { DailyCheckin, ProgressPhoto, WeeklyCheckinFull } from "@/types/db";

const WEEKLY_COLUMNS =
  "id, therapy_cycle_id, patient_id, week_number, checkin_date, weight_kg, waist_cm, hips_cm, abdomen_cm, wellbeing, energy, appetite, food_noise, symptoms, symptoms_notes";

const DAILY_COLUMNS =
  "id, therapy_cycle_id, patient_id, checkin_date, wellbeing, appetite, food_noise, energy, sleep, nausea, weakness, notes";

/** All weekly check-ins for a cycle, ordered by week_number ascending. */
export function useWeeklyCheckins(cycleId: string | null) {
  return useQuery({
    queryKey: ["weekly-checkins", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<WeeklyCheckinFull[]> => {
      const { data, error } = await supabase
        .from("weekly_checkins")
        .select(WEEKLY_COLUMNS)
        .eq("therapy_cycle_id", cycleId as string)
        .order("week_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WeeklyCheckinFull[];
    },
  });
}

/** All daily check-ins for a cycle, ordered by checkin_date descending. */
export function useDailyCheckins(cycleId: string | null) {
  return useQuery({
    queryKey: ["daily-checkins", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<DailyCheckin[]> => {
      const { data, error } = await supabase
        .from("daily_checkins")
        .select(DAILY_COLUMNS)
        .eq("therapy_cycle_id", cycleId as string)
        .order("checkin_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DailyCheckin[];
    },
  });
}

/** All progress photos for a cycle, ordered by photo_date ascending. */
export function useProgressPhotos(cycleId: string | null) {
  return useQuery({
    queryKey: ["progress-photos", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<ProgressPhoto[]> => {
      const { data, error } = await supabase
        .from("progress_photos")
        .select(
          "id, patient_id, therapy_cycle_id, weekly_checkin_id, file_url, angle, photo_date",
        )
        .eq("therapy_cycle_id", cycleId as string)
        .order("photo_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProgressPhoto[];
    },
  });
}
