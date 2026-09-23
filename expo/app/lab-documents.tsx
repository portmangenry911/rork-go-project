import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  NotebookPen,
  Upload,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardShadow, colors, fonts, radius, softShadow } from "@/constants/theme";
import {
  usePatientLabDocuments,
  type LabDocument,
  type LabFileType,
} from "@/hooks/useLabDocuments";
import { supabase } from "@/lib/supabase";

function iconFor(type: LabFileType): React.ReactNode {
  const size = 18;
  if (type === "image") {
    return <ImageIcon size={size} color={colors.navy} strokeWidth={2} />;
  }
  if (type === "manual") {
    return <NotebookPen size={size} color={colors.navy} strokeWidth={2} />;
  }
  return <FileText size={size} color={colors.navy} strokeWidth={2} />;
}

function formatShort(iso: string | null): string {
  if (iso === null) return "";
  const months = [
    "січ", "лют", "бер", "кві", "тра", "чер",
    "лип", "серп", "вер", "жов", "лис", "гру",
  ];
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function LabDocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { documents, isLoading, uploadFile, addManualEntry } =
    usePatientLabDocuments();

  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const openDocument = async (doc: LabDocument): Promise<void> => {
    if (doc.file_url === null) return;
    const { data } = await supabase.storage
      .from("lab-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (data?.signedUrl !== undefined) {
      await WebBrowser.openBrowserAsync(data.signedUrl);
    }
  };

  const handleUpload = (): void => {
    setError(null);
    uploadFile.mutate(undefined, {
      onError: (err: unknown) =>
        setError(err instanceof Error ? err.message : "Не вдалося завантажити."),
    });
  };

  const handleManualSave = (): void => {
    if (manualText.trim().length === 0) {
      setError("Опишіть показники.");
      return;
    }
    setError(null);
    addManualEntry.mutate(manualText.trim(), {
      onSuccess: () => {
        setManualText("");
        setIsManualOpen(false);
      },
      onError: (err: unknown) =>
        setError(err instanceof Error ? err.message : "Не вдалося зберегти."),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="lab-documents-back"
          >
            <ArrowLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>Аналізи</Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            testID="upload-lab-file"
            onPress={handleUpload}
            disabled={uploadFile.isPending}
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.pressed,
            ]}
          >
            {uploadFile.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Upload size={16} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.actionButtonText}>Завантажити файл</Text>
              </>
            )}
          </Pressable>
          <Pressable
            testID="toggle-manual-entry"
            onPress={() => {
              setError(null);
              setIsManualOpen((prev) => !prev);
            }}
            style={({ pressed }) => [
              styles.actionButtonOutline,
              pressed && styles.pressed,
            ]}
          >
            <NotebookPen size={16} color={colors.navy} strokeWidth={2} />
            <Text style={styles.actionButtonOutlineText}>Внести вручну</Text>
          </Pressable>
        </View>

        {isManualOpen && (
          <View style={styles.manualForm}>
            <TextInput
              testID="manual-entry-input"
              style={styles.manualInput}
              value={manualText}
              onChangeText={setManualText}
              placeholder="Напр.: Глюкоза — 5.4 ммоль/л, Холестерин — 4.2 ммоль/л"
              placeholderTextColor={colors.sub}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Pressable
              testID="save-manual-entry"
              onPress={handleManualSave}
              disabled={addManualEntry.isPending}
              style={({ pressed }) => [
                styles.manualSaveButton,
                pressed && styles.pressed,
              ]}
            >
              {addManualEntry.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.actionButtonText}>Зберегти</Text>
              )}
            </Pressable>
          </View>
        )}

        {error !== null && (
          <Text style={styles.error} testID="lab-documents-error">
            {error}
          </Text>
        )}

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.teal} />
          </View>
        ) : documents.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <FlaskConical size={26} color={colors.teal} strokeWidth={1.6} />
            </View>
            <Text style={styles.emptyTitle}>Аналізів ще немає</Text>
            <Text style={styles.emptyText}>
              Завантажте файл або внесіть показники вручну — лікар побачить
              їх тут.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
            testID="lab-documents-list"
          >
            {documents.map((doc) => (
              <Pressable
                key={doc.id}
                testID={`lab-document-${doc.id}`}
                onPress={() => openDocument(doc)}
                disabled={doc.file_url === null}
                style={({ pressed }) => [
                  styles.card,
                  pressed && doc.file_url !== null && styles.pressed,
                ]}
              >
                <View style={styles.cardIcon}>{iconFor(doc.file_type)}</View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {doc.file_type === "manual"
                      ? "Ручний запис"
                      : doc.file_name ?? "Файл"}
                  </Text>
                  {doc.notes !== null && doc.notes.length > 0 && (
                    <Text style={styles.cardNotes} numberOfLines={2}>
                      {doc.notes}
                    </Text>
                  )}
                  <Text style={styles.cardDate}>
                    {formatShort(doc.lab_date ?? doc.created_at)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontFamily: fonts.serif, fontSize: 22, color: colors.ink },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
  },
  actionButtonText: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1.2,
    borderColor: colors.navy,
  },
  actionButtonOutlineText: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.navy,
  },
  manualForm: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 14,
    ...cardShadow,
  },
  manualInput: {
    minHeight: 70,
    borderRadius: radius.button,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.ink,
  },
  manualSaveButton: {
    height: 42,
    borderRadius: radius.button,
    backgroundColor: colors.teal,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 10,
    ...cardShadow,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
  },
  cardNotes: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.sub,
    marginTop: 2,
  },
  cardDate: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    marginTop: 3,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontFamily: fonts.serif, fontSize: 19, color: colors.ink },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.sub,
    textAlign: "center",
    marginTop: 7,
  },
  pressed: { opacity: 0.85 },
});
