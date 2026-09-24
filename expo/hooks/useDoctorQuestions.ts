import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getDoctorUserIdForPatient,
  isDoctorNotificationEnabled,
  pushNotification,
} from "@/hooks/useNotifications";
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
  resolved: "Вирішено",
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

      const questionsEnabled = await isDoctorNotificationEnabled(
        doctor.doctorProfileId,
        "questions_enabled",
      );
      if (!questionsEnabled) return;

      const questionText = text.trim();
      const patientName =
        profile !== null
          ? `${profile.first_name} ${profile.last_name}`.trim()
          : "Пацієнт";
      await pushNotification({
        recipientUserId: doctor.userId,
        kind: "question",
        title: patientName,
        body:
          questionText.length > 80
            ? `${questionText.slice(0, 80)}…`
            : questionText,
        link: `/patient-detail?id=${patientId}`,
      });
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

  const invalidateOpenCount = (): void => {
    void queryClient.invalidateQueries({
      queryKey: ["doctor-open-questions-count", userId],
    });
  };

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
    onSuccess: () => {
      // "viewed" doesn't clear the open-questions count — the question
      // still needs a real resolution, not just a look.
      invalidate();
    },
  });

  const markResolved = useMutation({
    mutationFn: async (questionId: string): Promise<void> => {
      const { error } = await supabase
        .from("doctor_questions")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", questionId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      invalidateOpenCount();
    },
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

/**
 * Doctor-side, sitewide: count of unresolved questions ("new" + "viewed")
 * for badges. "Viewed" still counts — opening a question isn't resolving
 * it, so the count should keep nagging until the doctor marks it resolved.
 *
 * Scoped by current active patients (same join as the RLS select policy),
 * not by the doctor_id stored on each question row — so a question left
 * for a prior doctor still counts once the patient's current doctor picks
 * it up, matching PRD 6.1's "new doctor sees full history".
 */
export function useOpenQuestionsCount() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: ["doctor-open-questions-count", userId],
    enabled: userId !== null,
    queryFn: async (): Promise<number> => {
      const { data: doctorRow } = await supabase
        .from("doctor_profiles")
        .select("id")
        .eq("user_id", userId as string)
        .maybeSingle();
      const doctorId = doctorRow?.id as string | undefined;
      if (doctorId === undefined) return 0;

      const { data: relations, error: relationsError } = await supabase
        .from("doctor_patient_relations")
        .select("patient_id")
        .eq("doctor_id", doctorId)
        .eq("status", "active");
      if (relationsError) throw relationsError;
      const patientIds = (relations ?? []).map(
        (r) => r.patient_id as string,
      );
      if (patientIds.length === 0) return 0;

      const { count, error } = await supabase
        .from("doctor_questions")
        .select("id", { count: "exact", head: true })
        .in("patient_id", patientIds)
        .neq("status", "resolved");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
