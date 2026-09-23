import { useRouter } from "expo-router";
import { ArrowLeft, HelpCircle, Send } from "lucide-react-native";
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
  STATUS_LABELS,
  usePatientQuestions,
  type QuestionStatus,
} from "@/hooks/useDoctorQuestions";

function statusStyle(status: QuestionStatus): {
  pill: object;
  text: object;
} {
  if (status === "new") {
    return { pill: styles.pillNew, text: styles.pillTextNew };
  }
  if (status === "resolved") {
    return { pill: styles.pillResolved, text: styles.pillTextResolved };
  }
  return { pill: styles.pillViewed, text: styles.pillTextViewed };
}

/** "2026-09-23T10:00:00Z" → "23 вер" */
function formatShort(iso: string): string {
  const months = [
    "січ", "лют", "бер", "кві", "тра", "чер",
    "лип", "серп", "вер", "жов", "лис", "гру",
  ];
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function QuestionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { questions, isLoading, addQuestion } = usePatientQuestions();

  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (): void => {
    if (text.trim().length === 0) {
      setError("Введіть текст питання.");
      return;
    }
    setError(null);
    addQuestion.mutate(text.trim(), {
      onSuccess: () => setText(""),
      onError: (err: unknown) =>
        setError(err instanceof Error ? err.message : "Не вдалося надіслати."),
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
            testID="questions-back"
          >
            <ArrowLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>Питання лікарю</Text>
        </View>

        <View style={styles.composer}>
          <TextInput
            testID="question-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Напишіть питання лікарю…"
            placeholderTextColor={colors.sub}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          {error !== null && (
            <Text style={styles.error} testID="questions-error">
              {error}
            </Text>
          )}
          <Pressable
            testID="submit-question"
            onPress={handleSubmit}
            disabled={addQuestion.isPending}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && styles.pressed,
            ]}
          >
            {addQuestion.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Send size={16} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.submitText}>Додати питання</Text>
              </>
            )}
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.teal} />
          </View>
        ) : questions.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <HelpCircle size={26} color={colors.teal} strokeWidth={1.6} />
            </View>
            <Text style={styles.emptyTitle}>Питань ще немає</Text>
            <Text style={styles.emptyText}>
              Тут з'являться ваші питання лікарю та їх статус.
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
            testID="questions-list"
          >
            {questions.map((q) => {
              const st = statusStyle(q.status);
              return (
                <View
                  key={q.id}
                  style={styles.card}
                  testID={`question-${q.id}`}
                >
                  <View style={styles.cardHead}>
                    <View style={[styles.pill, st.pill]}>
                      <Text style={[styles.pillText, st.text]}>
                        {STATUS_LABELS[q.status]}
                      </Text>
                    </View>
                    <Text style={styles.date}>{formatShort(q.created_at)}</Text>
                  </View>
                  <Text style={styles.questionText}>{q.question_text}</Text>
                </View>
              );
            })}
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
  composer: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    ...cardShadow,
  },
  input: {
    minHeight: 76,
    borderRadius: radius.button,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.amber,
    marginTop: 8,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: radius.button,
    backgroundColor: colors.navy,
    marginTop: 12,
  },
  submitText: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: "#FFFFFF",
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 10,
    ...cardShadow,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillNew: { backgroundColor: "#FFF3C4" },
  pillViewed: { backgroundColor: colors.hairline },
  pillResolved: { backgroundColor: colors.mint },
  pillText: { fontFamily: fonts.bold, fontSize: 11 },
  pillTextNew: { color: "#8A6D00" },
  pillTextViewed: { color: colors.sub },
  pillTextResolved: { color: colors.tealDeep },
  date: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.sub,
  },
  questionText: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.ink,
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
