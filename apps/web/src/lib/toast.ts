import { create } from "zustand";

export type ToastOutcome = "pass" | "block";

export type ToastItem = {
  id: string;
  message: string;
  outcome: ToastOutcome;
};

type ToastStore = {
  items: ToastItem[];
  push: (message: string, outcome?: ToastOutcome) => void;
  dismiss: (id: string) => void;
};

let nextId = 0;

export const useToastStore = create<ToastStore>((set, get) => ({
  items: [],
  push: (message, outcome = "pass") => {
    const id = String(++nextId);
    set({ items: [...get().items, { id, message, outcome }] });
    window.setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ items: get().items.filter((item) => item.id !== id) }),
}));
