import { create } from "zustand";

/**
 * Cross-screen draft state for lab indicator values. A patient can open
 * several indicator detail screens (each with its own scroll ruler),
 * stage a value on each, then commit all of them at once from the
 * lab-documents list screen — nothing is written to the database until
 * that batch save. Lives only in memory: reset on app reload, and
 * explicitly cleared after a save or when the patient discards changes.
 */
interface LabIndicatorDraftState {
  /** indicatorId -> staged value, only for indicators the patient touched. */
  drafts: Record<string, number>;
  setDraft: (indicatorId: string, value: number) => void;
  clearAll: () => void;
}

export const useLabIndicatorDraftStore = create<LabIndicatorDraftState>(
  (set) => ({
    drafts: {},
    setDraft: (indicatorId, value) =>
      set((state) => ({
        drafts: { ...state.drafts, [indicatorId]: value },
      })),
    clearAll: () => set({ drafts: {} }),
  }),
);
