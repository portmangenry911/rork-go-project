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

/**
 * All progress photos for a cycle, ordered by photo_date ascending.
 * The "progress-photos" storage bucket is private, so `file_url` in the DB
 * row holds a storage path, not a usable URL — we swap it here for a
 * short-lived signed URL before returning to the UI.
 */
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
        // Newest sessions first so the latest progress is at the top.
        .order("photo_date", { ascending: false })
        .order("angle", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ProgressPhoto[];
      const signed = await Promise.all(
        rows.map(async (row) => {
          const { data: signedData } = await supabase.storage
            .from("progress-photos")
            .createSignedUrl(row.file_url, 3600);
          return { ...row, file_url: signedData?.signedUrl ?? row.file_url };
        }),
      );
      return signed;
    },
  });
}
