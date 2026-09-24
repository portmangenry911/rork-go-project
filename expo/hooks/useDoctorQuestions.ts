import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getDoctorUserIdForPatient } from "@/hooks/useNotifications";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { usePatientHome } from "@/hooks/usePatientHome";

export type QuestionStatus = "new" | "viewed" | "resolved";

export interface DoctorQuestion {
  id: string;
  patient_id: string;
  doctor_id: string;
  therapy_cycle_id: string | null;
  question_text: string;
  status: QuestionStatus;
  created_at: string;
  viewed_at: string | null;
  resolved_at: string | null;
}

export const STATUS_LABELS: Record<QuestionStatus, string> = {
  new: "Новий",
  viewed: "Переглянутий",
  resolved: "Розглянутий",
};

/** Patient-side: their own questions to their active doctor, plus adding one. */
export function usePatientQuestions() {
  const queryClient = useQueryClient();
  const { profile, cycle } = usePatientHome();
  const patientId = profile?.id ?? null;

  const questionsQuery = useQuery({
    queryKey: ["patient-questions", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<DoctorQuestion[]> => {
      const { data, error } = await supabase
        .from("doctor_questions")
        .select(
          "id, patient_id, doctor_id, therapy_cycle_id, question_text, status, created_at, viewed_at, resolved_at",
        )
        .eq("patient_id", patientId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DoctorQuestion[];
    },
  });

  const addQuestion = useMutation({
    mutationFn: async (text: string): Promise<void> => {
      if (patientId === null) throw new Error("Профіль пацієнта не знайдено.");
      const doctor = await getDoctorUserIdForPatient(patientId);
      if (doctor === null) {
        throw new Error("Активного лікаря не знайдено.");
      }
      const { error } = await supabase.from("doctor_questions").insert({
        patient_id: patientId,
        doctor_id: doctor.doctorProfileId,
        therapy_cycle_id: cycle?.id ?? null,
        question_text: text.trim(),
        status: "new",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["patient-questions", patientId],
      });
    },
  });

  return {
    questions: questionsQuery.data ?? [],
    isLoading: questionsQuery.isPending,
    addQuestion,
  };
}

/** Doctor-side: questions from one patient, plus status transitions. */
export function useQuestionsForPatient(patientId: string | null) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  const questionsQuery = useQuery({
    queryKey: ["doctor-patient-questions", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<DoctorQuestion[]> => {
      const { data, error } = await supabase
        .from("doctor_questions")
        .select(
          "id, patient_id, doctor_id, therapy_cycle_id, question_text, status, created_at, viewed_at, resolved_at",
        )
        .eq("patient_id", patientId as string)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[doctor-questions] fetch failed:", error.message, error);
        throw error;
      }
      return (data ?? []) as DoctorQuestion[];
    },
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({
      queryKey: ["doctor-patient-questions", patientId],
    });
  };

  const markViewed = useMutation({
    mutationFn: async (questionId: string): Promise<void> => {
      const { error } = await supabase
        .from("doctor_questions")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", questionId)
        .eq("status", "new");
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  const markResolved = useMutation({
    mutationFn: async (questionId: string): Promise<void> => {
      const { error } = await supabase
        .from("doctor_questions")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", questionId);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });

  return {
    questions: questionsQuery.data ?? [],
    isLoading: questionsQuery.isPending,
    isError: questionsQuery.isError,
    error: questionsQuery.error,
    markViewed,
    markResolved,
  };
}

/** Doctor-side, sitewide: count of "new" questions for badges. */
export function useNewQuestionsCount() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: ["doctor-new-questions-count", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<number> => {
      const { data: doctorRow } = await supabase
        .from("doctor_profiles")
        .select("id")
        .eq("user_id", userId as string)
        .maybeSingle();
      const doctorId = doctorRow?.id as string | undefined;
      if (doctorId === undefined) return 0;
      const { count, error } = await supabase
        .from("doctor_questions")
        .select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId)
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
