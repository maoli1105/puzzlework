/**
 * wsStore — グローバルWebSocket状態
 * ・send関数を全コンポーネントから呼べるようにする
 * ・リアルタイムカーソル位置を保持する
 */
import { create } from 'zustand';

export interface CursorState {
  userId: string;
  name: string;
  x: number;
  y: number;
  ts: number;
}

interface WSStore {
  // WS send function — AdminShell が初期化後に set する
  send: (data: Record<string, unknown>) => void;
  setSend: (fn: (data: Record<string, unknown>) => void) => void;

  // 他ユーザーのカーソル
  cursors: Record<string, CursorState>;
  setCursor: (userId: string, state: CursorState) => void;
  removeCursor: (userId: string) => void;
  clearCursors: () => void;
}

export const useWSStore = create<WSStore>((set) => ({
  send: () => {},
  setSend: (fn) => set({ send: fn }),

  cursors: {},
  setCursor: (userId, state) =>
    set((prev) => ({ cursors: { ...prev.cursors, [userId]: state } })),
  removeCursor: (userId) =>
    set((prev) => {
      const next = { ...prev.cursors };
      delete next[userId];
      return { cursors: next };
    }),
  clearCursors: () => set({ cursors: {} }),
}));
