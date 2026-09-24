import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Upload,
} from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import {
  latestByIndicator,
  useLabIndicatorsCatalog,
  usePatientLabIndicatorValues,
} from "@/hooks/useLabIndicators";
import { supabase } from "@/lib/supabase";
import { formatDateShort } from "@/utils/dates";

function iconFor(type: LabFileType): React.ReactNode {
  const size = 18;
  if (type === "image") {
    return <ImageIcon size={size} color={colors.navy} strokeWidth={2} />;
  }
  return <FileText size={size} color={colors.navy} strokeWidth={2} />;
}

export default function LabDocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const renderCount = useRef(0);
  renderCount.current += 1;
  console.log("[lab-documents] render #", renderCount.current);

  const { documents, isLoading, uploadFile } = usePatientLabDocuments();
  const catalogQuery = useLabIndicatorsCatalog();
  const { values: indicatorValues, isLoading: indicatorsLoading } =
    usePatientLabIndicatorValues();

  const [error, setError] = useState<string | null>(null);

  const openDocument = async (doc: LabDocument): Promise<void> => {
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
          { paddingBottom: insets.bottom + 24 },
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

        {error !== null && (
          <Text style={styles.error} testID="lab-documents-error">
            {error}
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
                    const lastValue = latest.get(indicator.id) ?? null;
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
                          {lastValue !== null && (
                            <Text style={styles.indicatorDate}>
                              {formatDateShort(lastValue.measured_at)}
                            </Text>
                          )}
                        </View>
                        <Text style={styles.indicatorValue}>
                          {lastValue !== null
                            ? `${lastValue.value} ${indicator.unit}`
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
  pressed: { opacity: 0.85 },
});
