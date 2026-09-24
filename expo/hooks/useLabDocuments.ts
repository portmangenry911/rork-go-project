import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";

import { supabase } from "@/lib/supabase";
import { usePatientHome } from "@/hooks/usePatientHome";
import { todayISO } from "@/utils/dates";

export type LabFileType = "pdf" | "image";

export interface LabDocument {
  id: string;
  patient_id: string;
  therapy_cycle_id: string | null;
  file_url: string;
  file_type: LabFileType;
  file_name: string;
  lab_date: string | null;
  notes: string | null;
  created_at: string;
}

/** Patient-side: their own lab documents (file uploads only — structured
 * indicator readings live in useLabIndicators.ts instead). */
export function usePatientLabDocuments() {
  const queryClient = useQueryClient();
  const { profile, cycle, userId } = usePatientHomeWithUserId();
  const patientId = profile?.id ?? null;

  const documentsQuery = useQuery({
    queryKey: ["patient-lab-documents", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<LabDocument[]> => {
      const { data, error } = await supabase
        .from("lab_documents")
        .select(
          "id, patient_id, therapy_cycle_id, file_url, file_type, file_name, lab_date, notes, created_at",
        )
        .eq("patient_id", patientId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LabDocument[];
    },
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({
      queryKey: ["patient-lab-documents", patientId],
    });
  };

  const uploadFile = useMutation({
    mutationFn: async (): Promise<"picked" | "canceled"> => {
      if (patientId === null || userId === null) {
        throw new Error("Профіль пацієнта не знайдено.");
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return "canceled";
      const asset = result.assets[0];
      if (asset === undefined) return "canceled";

      const response = await fetch(asset.uri);
      const bytes = await response.arrayBuffer();
      const path = `${userId}/${Date.now()}-${asset.name}`;
      const { error: uploadError } = await supabase.storage
        .from("lab-documents")
        .upload(path, bytes, {
          contentType: asset.mimeType ?? "application/octet-stream",
        });
      if (uploadError) throw new Error(uploadError.message);

      const fileType: LabFileType = (asset.mimeType ?? "").startsWith(
        "image/",
      )
        ? "image"
        : "pdf";

      const { error: insertError } = await supabase
        .from("lab_documents")
        .insert({
          patient_id: patientId,
          therapy_cycle_id: cycle?.id ?? null,
          file_url: path,
          file_type: fileType,
          file_name: asset.name,
          lab_date: todayISO(),
        });
      if (insertError) throw new Error(insertError.message);
      return "picked";
    },
    onSuccess: invalidate,
  });

  return {
    documents: documentsQuery.data ?? [],
    isLoading: documentsQuery.isPending,
    uploadFile,
  };
}

/** usePatientHome doesn't expose userId — pull it in alongside. */
function usePatientHomeWithUserId() {
  const home = usePatientHome();
  const { profile } = home;
  return { ...home, userId: profile?.user_id ?? null };
}

/** Doctor-side: one patient's lab documents, with signed URLs for files. */
export function useLabDocumentsForPatient(patientId: string | null) {
  return useQuery({
    queryKey: ["doctor-patient-lab-documents", patientId],
    enabled: patientId !== null,
    queryFn: async (): Promise<LabDocument[]> => {
      const { data, error } = await supabase
        .from("lab_documents")
        .select(
          "id, patient_id, therapy_cycle_id, file_url, file_type, file_name, lab_date, notes, created_at",
        )
        .eq("patient_id", patientId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as LabDocument[];
      const signed = await Promise.all(
        rows.map(async (row) => {
          if (row.file_url === null) return row;
          const { data: signedData } = await supabase.storage
            .from("lab-documents")
            .createSignedUrl(row.file_url, 3600);
          return { ...row, file_url: signedData?.signedUrl ?? row.file_url };
        }),
      );
      return signed;
    },
  });
}
