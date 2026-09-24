import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { usePatientHome } from "@/hooks/usePatientHome";

/**
 * Bump this whenever the legal text changes — patients who agreed to an
 * older version will be asked to re-confirm. Current text is a legal
 * DRAFT pending lawyer sign-off before production.
 */
export const CONSENT_VERSION = "2026-09-24-draft";

export interface ConsentItem {
  key: string;
  text: string;
}

export const CONSENT_ITEMS: ConsentItem[] = [
  {
    key: "not_medical_device",
    text: "ознайомлений(а), що GLP One не є медичним виробом і не замінює консультацію лікаря",
  },
  {
    key: "doctor_decides",
    text: "розумію, що всі рішення щодо мого лікування приймає лікар, з яким я працюю через Платформу",
  },
  {
    key: "data_processing",
    text: "надаю згоду на обробку моїх персональних даних, включно з даними про стан здоров'я (вага, показники аналізів, фото прогресу), для цілей ведення терапевтичного щоденника та комунікації з лікарем",
  },
  {
    key: "private_photo_storage",
    text: "розумію, що фото прогресу зберігаються у приватному сховищі, доступ до якого має лише я та мій лікар",
  },
  {
    key: "emergency_services",
    text: "розумію, що у разі невідкладної медичної ситуації я звертаюся до екстрених служб, а не через чат Платформи",
  },
  {
    key: "not_verified_diary",
    text: "розумію, що GLP One є лише щоденником для ведення особистих записів і каналом зв'язку з лікарем — Платформа не перевіряє достовірність введених мною даних і не бере участі у прийнятті будь-яких медичних рішень",
  },
  {
    key: "own_responsibility",
    text: "самостійно приймаю рішення щодо дотримання рекомендацій лікаря та несу особисту відповідальність за наслідки цих рішень",
  },
  {
    key: "platform_liability_release",
    text: "звільняю Платформу від відповідальності за зміст моєї взаємодії з лікарем та за медичні наслідки такої взаємодії",
  },
  {
    key: "can_revoke",
    text: "можу в будь-який момент відкликати згоду та видалити свої дані, звернувшись за контактами, вказаними в Умовах користування",
  },
];

export interface PatientConsent {
  id: string;
  consent_version: string;
  given_at: string;
}

/** Latest consent record for the signed-in patient, if any. */
export function usePatientConsentStatus() {
  const { profile } = usePatientHome();
  const patientId = profile?.id ?? null;

  const query = useQuery({
    queryKey: ["patient-consent", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<PatientConsent | null> => {
      const { data, error } = await supabase
        .from("patient_consents")
        .select("id, consent_version, given_at")
        .eq("patient_id", patientId as string)
        .order("given_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PatientConsent | null;
    },
  });

  const hasCurrentConsent =
    query.data !== null &&
    query.data !== undefined &&
    query.data.consent_version === CONSENT_VERSION;

  return { ...query, hasCurrentConsent, patientId };
}

/** Records agreement to the current consent text version. */
export function useGiveConsent() {
  const queryClient = useQueryClient();
  const { profile } = usePatientHome();
  const patientId = profile?.id ?? null;

  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (patientId === null) {
        throw new Error("Профіль пацієнта не знайдено.");
      }
      const { error } = await supabase.from("patient_consents").insert({
        patient_id: patientId,
        consent_version: CONSENT_VERSION,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["patient-consent", patientId],
      });
    },
  });
}
