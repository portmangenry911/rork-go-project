import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type {
  PatientProfile,
  RelationWithDoctor,
  TherapyCycle,
  WeeklyCheckin,
} from "@/types/db";
/** Loads the patient's profile, doctor relation, active cycle and latest check-in. */
export function usePatientHome() {
  const { userId } = useAuth();
  const profileQuery = useQuery({
    queryKey: ["patient-profile", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<PatientProfile | null> => {
      const { data, error } = await supabase
        .from("patient_profiles")
        .select("id, user_id, first_name, last_name, date_of_birth, city")
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return data as PatientProfile | null;
    },
  });
  const patientId = profileQuery.data?.id ?? null;
  const relationQuery = useQuery({
    queryKey: ["patient-doctor-relation", patientId, userId],
    enabled: patientId !== null,
    queryFn: async (): Promise<RelationWithDoctor | null> => {
      const { data, error } = await supabase
        .from("doctor_patient_relations")
        .select("id, status, doctor:doctor_profiles(id, first_name, last_name)")
        .eq("patient_id", patientId as string)
        .in("status", ["active", "pending"]);
      console.log("[relation-debug] patientId:", patientId, "rows:", data, "error:", error);
      if (error) throw error;
      const rows = (data ?? []) as unknown as RelationWithDoctor[];
      console.log("[relation-debug]", patientId, JSON.stringify(data), JSON.stringify(error));
      const active = rows.find((r) => r.status === "active");
      return active ?? rows[0] ?? null;
    },
  });
  const cycleQuery = useQuery({
    queryKey: ["patient-active-cycle", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<TherapyCycle | null> => {
      const { data, error } = await supabase
        .from("therapy_cycles")
        .select(
          "id, doctor_id, patient_id, protocol_name, goal_type, goal_start, goal_target, goal_unit, goal_waist_cm, goal_hips_cm, goal_abdomen_cm, start_date, expected_end, status",
        )
        .eq("patient_id", patientId as string)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TherapyCycle | null;
    },
  });
  const cycleId = cycleQuery.data?.id ?? null;
  const checkinQuery = useQuery({
    queryKey: ["latest-checkin", cycleId],
    enabled: cycleId !== null,
    queryFn: async (): Promise<WeeklyCheckin | null> => {
      const { data, error } = await supabase
        .from("weekly_checkins")
        .select(
          "id, therapy_cycle_id, patient_id, week_number, checkin_date, weight_kg, waist_cm, hips_cm, abdomen_cm",
        )
        .eq("therapy_cycle_id", cycleId as string)
        .order("checkin_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WeeklyCheckin | null;
    },
  });
  const isLoading =
    profileQuery.isPending ||
    (patientId !== null &&
      (relationQuery.isPending || cycleQuery.isPending)) ||
    (cycleId !== null && checkinQuery.isPending);
  return {
    profile: profileQuery.data ?? null,
    relation: relationQuery.data ?? null,
    cycle: cycleQuery.data ?? null,
    latestCheckin: checkinQuery.data ?? null,
    isLoading,
    isError:
      profileQuery.isError ||
      relationQuery.isError ||
      cycleQuery.isError ||
      checkinQuery.isError,
  };
}