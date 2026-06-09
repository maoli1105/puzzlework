import { create } from 'zustand';

interface UpgradeState {
  open: boolean;
  /** サーバーから返ってきたエラーメッセージ（例: "この機能には pro プラン以上が必要です"） */
  message: string;
  show: (message: string) => void;
  hide: () => void;
}

export const useUpgradeStore = create<UpgradeState>((set) => ({
  open: false,
  message: '',
  show: (message) => set({ open: true, message }),
  hide: () => set({ open: false, message: '' }),
}));
