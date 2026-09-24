import { useIsFocused, useNavigation, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Upload,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardShadow, colors, fonts, radius } from "@/constants/theme";
import {
  usePatientLabDocuments,
  type LabDocument,
  type LabFileType,
} from "@/hooks/useLabDocuments";
import { useLabIndicatorDraftStore } from "@/hooks/useLabIndicatorDraftStore";
import {
  latestByIndicator,
  useLabIndicatorsCatalog,
  usePatientLabIndicatorValues,
  useSaveLabIndicatorDrafts,
} from "@/hooks/useLabIndicators";
import { supabase } from "@/lib/supabase";
import { formatDateShort } from "@/utils/dates";

const CONSENT_PREFIX =
  "Я підтверджую, що особисто вніс(ла) та перевірив(ла) ці дані, і несу відповідальність за їх достовірність. Ознайомлений(а) з ";
const CONSENT_LINK_LABEL = "Умовами використання";

function iconFor(type: LabFileType): React.ReactNode {
  const size = 18;
  if (type === "image") {
    return <ImageIcon size={size} color={colors.navy} strokeWidth={2} />;
  }
  return <FileText size={size} color={colors.navy} strokeWidth={2} />;
}

export default function LabDocumentsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { documents, isLoading, uploadFile } = usePatientLabDocuments();
  const catalogQuery = useLabIndicatorsCatalog();
  const { values: indicatorValues, isLoading: indicatorsLoading } =
    usePatientLabIndicatorValues();

  const drafts = useLabIndicatorDraftStore((s) => s.drafts);
  const clearAllDrafts = useLabIndicatorDraftStore((s) => s.clearAll);
  const saveDrafts = useSaveLabIndicatorDrafts();
  const draftEntries = Object.entries(drafts);
  const hasDrafts = draftEntries.length > 0;

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [stickyBarHeight, setStickyBarHeight] = useState<number>(0);

  // Leaving with unsaved drafts — intercept and ask.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  const [leaveConsentChecked, setLeaveConsentChecked] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const pendingActionRef = useRef<Parameters<
    Parameters<typeof navigation.addListener<"beforeRemove">>[1]
  >[0]["data"]["action"] | null>(null);
  // Set when the confirm dialog was triggered by the browser's own back
  // button (web popstate) rather than in-app navigation — see the web
  // effect below. Determines how proceedWithPendingAction actually leaves.
  const webLeaveRef = useRef<boolean>(false);
  const ignoreNextPopstateRef = useRef<boolean>(false);

  // Native / in-app navigation (our back button, hardware back, gestures)
  // — expo-router's own navigation dispatch, works as-is on web too for
  // in-app links, just not for the browser chrome's back button.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (Object.keys(draftsRef.current).length === 0) return;
      e.preventDefault();
      webLeaveRef.current = false;
      pendingActionRef.current = e.data.action;
      setLeaveError(null);
      setLeaveConsentChecked(false);
      setLeaveConfirmVisible(true);
    });
    return unsubscribe;
  }, [navigation]);

  // Web only: the browser's own back/forward button changes the URL via
  // popstate, which beforeRemove above never sees (it only knows about
  // in-app navigation). Arm a decoy history entry while there are drafts
  // AND this screen is the focused one — so navigating between an
  // indicator's detail screen and this list (both part of the same flow)
  // never triggers it, only actually leaving the flow does. Gating on
  // focus also keeps the decoy's URL correct: it must be pushed while
  // lab-documents itself is the current history entry, not whatever
  // screen happened to be on top when a draft was made.
  useEffect(() => {
    if (Platform.OS !== "web" || !hasDrafts || !isFocused) return;
    if (typeof window === "undefined") return;

    window.history.pushState({ labDraftGuard: true }, "", window.location.href);

    const onPopState = (): void => {
      if (ignoreNextPopstateRef.current) {
        ignoreNextPopstateRef.current = false;
        return;
      }
      if (Object.keys(draftsRef.current).length === 0) return;
      // Hold position — re-arm the decoy — and ask instead of leaving.
      window.history.pushState(
        { labDraftGuard: true },
        "",
        window.location.href,
      );
      webLeaveRef.current = true;
      pendingActionRef.current = null;
      setLeaveError(null);
      setLeaveConsentChecked(false);
      setLeaveConfirmVisible(true);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [hasDrafts, isFocused]);

  // Web only: tab close / refresh / typed URL — the browser's own
  // "leave site?" dialog. Its text can't be customized in modern
  // browsers, but it's a real safety net for the cases popstate can't
  // catch either.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent): void => {
      if (Object.keys(draftsRef.current).length === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const proceedWithPendingAction = (): void => {
    setLeaveConfirmVisible(false);
    if (Platform.OS === "web" && webLeaveRef.current) {
      webLeaveRef.current = false;
      ignoreNextPopstateRef.current = true;
      window.history.back();
      return;
    }
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action !== null) {
      navigation.dispatch(action);
    }
  };

  const handleDiscardAndLeave = (): void => {
    clearAllDrafts();
    proceedWithPendingAction();
  };

  const handleSaveAndLeave = (): void => {
    if (!leaveConsentChecked) return;
    setLeaveError(null);
    saveDrafts.mutate(draftsRef.current, {
      onSuccess: () => {
        clearAllDrafts();
        proceedWithPendingAction();
      },
      onError: (err: unknown) =>
        setLeaveError(
          err instanceof Error ? err.message : "Не вдалося зберегти.",
        ),
    });
  };

  const openDocument = async (doc: LabDocument): Promise<void> => {
    const { data } = await supabase.storage
      .from("lab-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (data?.signedUrl !== undefined) {
      await WebBrowser.openBrowserAsync(data.signedUrl);
    }
  };

  const handleUpload = (): void => {
    setUploadError(null);
    uploadFile.mutate(undefined, {
      onError: (err: unknown) =>
        setUploadError(
          err instanceof Error ? err.message : "Не вдалося завантажити.",
        ),
    });
  };

  const handleSaveIndicators = (): void => {
    if (!consentChecked) return;
    setSaveError(null);
    saveDrafts.mutate(drafts, {
      onSuccess: () => {
        clearAllDrafts();
        setConsentChecked(false);
      },
      onError: (err: unknown) =>
        setSaveError(err instanceof Error ? err.message : "Не вдалося зберегти."),
    });
  };

  const latest = latestByIndicator(indicatorValues);
  const indicators = catalogQuery.data ?? [];
  const categories = Array.from(new Set(indicators.map((i) => i.category)));

  return (
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 + (hasDrafts ? stickyBarHeight : 0) },
        ]}
        showsVerticalScrollIndicator={false}
        testID="lab-documents-screen"
      >
        <Text style={styles.sectionLabel}>ФАЙЛИ</Text>
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
              <Text style={styles.actionButtonText}>Завантажити PDF/фото</Text>
            </>
          )}
        </Pressable>

        {uploadError !== null && (
          <Text style={styles.error} testID="lab-documents-error">
            {uploadError}
          </Text>
        )}

        {isLoading ? (
          <ActivityIndicator color={colors.teal} style={styles.indicatorsLoading} />
        ) : documents.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <FlaskConical size={22} color={colors.teal} strokeWidth={1.6} />
            </View>
            <Text style={styles.emptyText}>Файлів ще немає</Text>
          </View>
        ) : (
          documents.map((doc) => (
            <Pressable
              key={doc.id}
              testID={`lab-document-${doc.id}`}
              onPress={() => openDocument(doc)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardIcon}>{iconFor(doc.file_type)}</View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{doc.file_name}</Text>
                <Text style={styles.cardDate}>
                  {formatDateShort(doc.lab_date ?? doc.created_at)}
                </Text>
              </View>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionLabel}>ПОКАЗНИКИ</Text>
        {indicatorsLoading || catalogQuery.isPending ? (
          <ActivityIndicator color={colors.teal} style={styles.indicatorsLoading} />
        ) : (
          categories.map((category) => (
            <View key={category} style={styles.categoryBlock}>
              <Text style={styles.categoryTitle}>{category}</Text>
              <View style={styles.listCard}>
                {indicators
                  .filter((i) => i.category === category)
                  .map((indicator, i) => {
                    const savedValue = latest.get(indicator.id) ?? null;
                    const draftValue = drafts[indicator.id];
                    const isDraft = draftValue !== undefined;
                    return (
                      <Pressable
                        key={indicator.id}
                        testID={`indicator-row-${indicator.code}`}
                        onPress={() =>
                          router.push({
                            pathname: "/lab-indicator",
                            params: { code: indicator.code },
                          })
                        }
                        style={[
                          styles.indicatorRow,
                          i > 0 && styles.indicatorRowBorder,
                        ]}
                      >
                        <View style={styles.indicatorInfo}>
                          <Text style={styles.indicatorLabel}>
                            {indicator.label}
                          </Text>
                          {!isDraft && savedValue !== null && (
                            <Text style={styles.indicatorDate}>
                              {formatDateShort(savedValue.measured_at)}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.indicatorValue,
                            isDraft && styles.indicatorValueDraft,
                          ]}
                        >
                          {isDraft
                            ? `${draftValue} ${indicator.unit}`
                            : savedValue !== null
                              ? `${savedValue.value} ${indicator.unit}`
                              : "—"}
                        </Text>
                        <ChevronRight
                          size={16}
                          color={colors.sub}
                          strokeWidth={2}
                        />
                      </Pressable>
                    );
                  })}
              </View>
            </View>
          ))
        )}

      </ScrollView>

      {hasDrafts && (
        <View
          style={[styles.stickyBar, { paddingBottom: insets.bottom + 14 }]}
          onLayout={(e) => setStickyBarHeight(e.nativeEvent.layout.height)}
          testID="save-indicators-card"
        >
          <Text style={styles.saveSummary}>
            Змінено показників: {draftEntries.length}
          </Text>

          <View style={styles.consentRow}>
            <Pressable
              testID="indicators-consent-checkbox"
              onPress={() => setConsentChecked((prev) => !prev)}
              style={[
                styles.checkbox,
                consentChecked && styles.checkboxChecked,
              ]}
            >
              {consentChecked && (
                <Check size={13} color="#FFFFFF" strokeWidth={3} />
              )}
            </Pressable>
            <Text
              style={styles.consentText}
              onPress={() => setConsentChecked((prev) => !prev)}
            >
              {CONSENT_PREFIX}
              <Text
                style={styles.consentLink}
                onPress={() =>
                  router.push("/patient-consent?review=1" as never)
                }
              >
                {CONSENT_LINK_LABEL}
              </Text>
              .
            </Text>
          </View>

          {saveError !== null && (
            <Text style={styles.error} testID="save-indicators-error">
              {saveError}
            </Text>
          )}

          <Pressable
            testID="save-indicators-button"
            onPress={handleSaveIndicators}
            disabled={!consentChecked || saveDrafts.isPending}
            style={({ pressed }) => [
              styles.saveButton,
              !consentChecked && styles.saveButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {saveDrafts.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>
                Зберегти показники аналізу
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <Modal
        visible={leaveConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard} testID="leave-confirm-modal">
            <Text style={styles.modalTitle}>Незбережені дані</Text>
            <Text style={styles.modalText}>
              У вас є незбережені дані аналізів. Зберегти зміни?
            </Text>

            <View style={styles.consentRow}>
              <Pressable
                testID="leave-consent-checkbox"
                onPress={() => setLeaveConsentChecked((prev) => !prev)}
                style={[
                  styles.checkbox,
                  leaveConsentChecked && styles.checkboxChecked,
                ]}
              >
                {leaveConsentChecked && (
                  <Check size={13} color="#FFFFFF" strokeWidth={3} />
                )}
              </Pressable>
              <Text
                style={styles.consentText}
                onPress={() => setLeaveConsentChecked((prev) => !prev)}
              >
                {CONSENT_PREFIX}
                <Text
                  style={styles.consentLink}
                  onPress={() =>
                    router.push("/patient-consent?review=1" as never)
                  }
                >
                  {CONSENT_LINK_LABEL}
                </Text>
                .
              </Text>
            </View>

            {leaveError !== null && (
              <Text style={styles.error} testID="leave-confirm-error">
                {leaveError}
              </Text>
            )}
            <View style={styles.modalActions}>
              <Pressable
                testID="leave-discard-button"
                onPress={handleDiscardAndLeave}
                style={({ pressed }) => [
                  styles.modalDiscardButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalDiscardText}>Не зберігати</Text>
              </Pressable>
              <Pressable
                testID="leave-save-button"
                onPress={handleSaveAndLeave}
                disabled={!leaveConsentChecked || saveDrafts.isPending}
                style={({ pressed }) => [
                  styles.modalSaveButton,
                  !leaveConsentChecked && styles.saveButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {saveDrafts.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Зберегти</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.sub,
    marginTop: 4,
    marginBottom: 10,
  },
  indicatorsLoading: {
    marginBottom: 14,
  },
  categoryBlock: {
    marginBottom: 14,
  },
  categoryTitle: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.navy,
    marginBottom: 6,
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    ...cardShadow,
  },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
  },
  indicatorRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  indicatorInfo: { flex: 1 },
  indicatorLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
  },
  indicatorDate: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.sub,
    marginTop: 2,
  },
  indicatorValue: {
    fontFamily: fonts.serif,
    fontSize: 16,
    color: colors.navyDeep,
  },
  indicatorValueDraft: {
    color: colors.gold,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    marginBottom: 12,
  },
  actionButtonText: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    marginBottom: 8,
  },
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
  cardDate: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
    marginTop: 3,
  },
  emptyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.sub,
  },
  stickyBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    ...cardShadow,
  },
  saveSummary: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.ink,
    marginBottom: 12,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  consentText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.sub,
  },
  consentLink: {
    fontFamily: fonts.semibold,
    color: colors.navy,
    textDecorationLine: "underline",
  },
  saveButton: {
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 22,
    ...cardShadow,
  },
  modalTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 8,
  },
  modalText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.sub,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  modalDiscardButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDiscardText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.sub,
  },
  modalSaveButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSaveText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.85 },
});
