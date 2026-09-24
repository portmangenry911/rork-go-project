import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { usePatientHome } from "@/hooks/usePatientHome";
import { todayISO } from "@/utils/dates";

export interface LabIndicator {
  id: string;
  code: string;
  label: string;
  unit: string;
  category: string;
  sort_order: number;
  min_value: number;
  max_value: number;
  step: number;
}

export interface LabIndicatorValue {
  id: string;
  patient_id: string;
  indicator_id: string;
  value: number;
  measured_at: string;
  created_at: string;
}

/** The read-only catalog of trackable lab indicators — rarely changes. */
export function useLabIndicatorsCatalog() {
  const query = useQuery({
    queryKey: ["lab-indicators-catalog"],
    staleTime: 1000 * 60 * 60,
    queryFn: async (): Promise<LabIndicator[]> => {
      console.log("[lab-indicators-catalog] queryFn firing");
      const { data, error } = await supabase
        .from("lab_indicators")
        .select(
          "id, code, label, unit, category, sort_order, min_value, max_value, step",
        )
        .order("sort_order", { ascending: true });
      if (error) {
        console.error("[lab-indicators-catalog] error:", error.code, error.message, error.details, error.hint);
        throw error;
      }
      console.log("[lab-indicators-catalog] rows:", data?.length);
      return (data ?? []) as LabIndicator[];
    },
  });
  console.log(
    "[lab-indicators-catalog] status:", query.status,
    "fetchStatus:", query.fetchStatus,
    "isPending:", query.isPending,
    "isError:", query.isError,
    "error:", query.error,
    "dataUndefined:", query.data === undefined,
  );
  return query;
}

/** Latest value per indicator, derived from the full value history. */
export function latestByIndicator(
  values: LabIndicatorValue[],
): Map<string, LabIndicatorValue> {
  const latest = new Map<string, LabIndicatorValue>();
  for (const v of values) {
    const current = latest.get(v.indicator_id);
    if (current === undefined || v.measured_at > current.measured_at) {
      latest.set(v.indicator_id, v);
    }
  }
  return latest;
}

/** Patient-side: their own indicator readings, plus adding a new one. */
export function usePatientLabIndicatorValues() {
  const queryClient = useQueryClient();
  const { profile } = usePatientHome();
  const patientId = profile?.id ?? null;

  const valuesQuery = useQuery({
    queryKey: ["patient-lab-indicator-values", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<LabIndicatorValue[]> => {
      console.log("[patient-lab-indicator-values] queryFn firing, patientId:", patientId);
      const { data, error } = await supabase
        .from("lab_indicator_values")
        .select("id, patient_id, indicator_id, value, measured_at, created_at")
        .eq("patient_id", patientId as string)
        .order("measured_at", { ascending: false });
      if (error) {
        console.error("[patient-lab-indicator-values] error:", error.code, error.message, error.details, error.hint);
        throw error;
      }
      console.log("[patient-lab-indicator-values] rows:", data?.length);
      return (data ?? []) as LabIndicatorValue[];
    },
  });
  console.log(
    "[patient-lab-indicator-values] patientId:", patientId,
    "status:", valuesQuery.status,
    "fetchStatus:", valuesQuery.fetchStatus,
    "isPending:", valuesQuery.isPending,
    "isError:", valuesQuery.isError,
    "error:", valuesQuery.error,
  );

  const addValue = useMutation({
    mutationFn: async (input: {
      indicatorId: string;
      value: number;
      measuredAt?: string;
    }): Promise<void> => {
      if (patientId === null) throw new Error("Профіль пацієнта не знайдено.");
      const { error } = await supabase.from("lab_indicator_values").insert({
        patient_id: patientId,
        indicator_id: input.indicatorId,
        value: input.value,
        measured_at: input.measuredAt ?? todayISO(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["patient-lab-indicator-values", patientId],
      });
    },
  });

  return {
    values: valuesQuery.data ?? [],
    isLoading: valuesQuery.isPending,
    addValue,
  };
}

/** Doctor-side: one patient's indicator readings, read-only. */
export function useLabIndicatorValuesForPatient(patientId: string | null) {
  return useQuery({
    queryKey: ["doctor-patient-lab-indicator-values", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<LabIndicatorValue[]> => {
      const { data, error } = await supabase
        .from("lab_indicator_values")
        .select("id, patient_id, indicator_id, value, measured_at, created_at")
        .eq("patient_id", patientId as string)
        .order("measured_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LabIndicatorValue[];
    },
  });
}
