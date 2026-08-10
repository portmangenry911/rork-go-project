import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import type { DoctorProfile, RelationWithPatient } from "@/types/db";

/** Loads the doctor's profile and their active patient relations. */
export function useDoctorHome() {
  const { userId } = useAuth();

  const profileQuery = useQuery({
    queryKey: ["doctor-profile", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<DoctorProfile | null> => {
      const { data, error } = await supabase
        .from("doctor_profiles")
        .select(
          "id, user_id, first_name, last_name, specialization, city, is_founding_doctor",
        )
        .eq("user_id", userId as string)
        .maybeSingle();
      if (error) throw error;
      return data as DoctorProfile | null;
    },
  });

  const doctorId = profileQuery.data?.id ?? null;

  const patientsQuery = useQuery({
    queryKey: ["doctor-active-patients", doctorId],
    enabled: doctorId !== null,
    queryFn: async (): Promise<RelationWithPatient[]> => {
      const { data, error } = await supabase
        .from("doctor_patient_relations")
        .select("id, status, patient:patient_profiles(id, first_name, last_name)")
        .eq("doctor_id", doctorId as string)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as RelationWithPatient[];
    },
  });

  return {
    profile: profileQuery.data ?? null,
    relations: patientsQuery.data ?? [],
    isLoading:
      profileQuery.isPending || (doctorId !== null && patientsQuery.isPending),
    isError: profileQuery.isError || patientsQuery.isError,
  };
}
