import { create } from 'zustand';
import { WSEvent } from '../types';

export interface Notification {
  id: string;
  type: string;
  message: string;
  piece_id?: string;
  ts: Date;
  read: boolean;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (event: WSEvent) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  removeNotification: (id: string) => void;
  clear: () => void;
}

const STORAGE_KEY = 'pw_notifications';
const MAX_STORED = 50;

function serialize(ns: Notification[]): string {
  return JSON.stringify(ns.map(n => ({ ...n, ts: n.ts.toISOString() })));
}

function deserialize(raw: string): Notification[] {
  try {
    const arr = JSON.parse(raw);
    return arr.map((n: Record<string, unknown>) => ({ ...n, ts: new Date(n.ts as string) }));
  } catch { return []; }
}

function loadFromStorage(): Notification[] {
  try { return deserialize(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function saveToStorage(ns: Notification[]) {
  try { localStorage.setItem(STORAGE_KEY, serialize(ns.slice(0, MAX_STORED))); }
  catch { /* storage full – ignore */ }
}

function eventToNotification(event: WSEvent): Notification | null {
  const id = Math.random().toString(36).slice(2);
  const ts = new Date();
  const msg = event.payload.message as string | undefined;
  const piece_id = event.payload.piece_id as string | undefined;

  switch (event.type) {
    case 'piece_ready':
      return { id, type: 'piece_ready', message: msg || '新しい仕事が届きました', piece_id, ts, read: false };
    case 'piece_assigned':
      return { id, type: 'piece_assigned', message: msg || 'ピースが割り当てられました', piece_id, ts, read: false };
    case 'piece_done': {
      const title = event.payload.title as string | undefined;
      return { id, type: 'piece_done', message: msg || (title ? `「${title}」が完了しました` : 'ピースが完了しました'), piece_id, ts, read: false };
    }
    case 'piece_status_changed': {
      const title = event.payload.title as string | undefined;
      const status = event.payload.status as string | undefined;
      const statusLabel = status === 'in_progress' ? '進行中' : status ?? '';
      return { id, type: 'piece_status_changed', message: title ? `「${title}」が${statusLabel}になりました` : 'ステータスが更新されました', piece_id, ts, read: false };
    }
    case 'auto_promoted':
      return { id, type: 'auto_promoted', message: msg || 'ピースが自動昇格しました', piece_id, ts, read: false };
    case 'skill_levelup':
      return { id, type: 'skill_levelup', message: msg || 'スキルがレベルアップしました', ts, read: false };
    case 'alert':
    case 'bottleneck_alert':
      return { id, type: 'alert', message: msg || 'アラート', piece_id, ts, read: false };
    default:
      return null;
  }
}

const initial = loadFromStorage();

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: initial,
  unreadCount: initial.filter(n => !n.read).length,

  addNotification: (event) => {
    const n = eventToNotification(event);
    if (!n) return;
    set(s => {
      const next = [n, ...s.notifications].slice(0, MAX_STORED);
      saveToStorage(next);
      return { notifications: next, unreadCount: s.unreadCount + 1 };
    });
  },

  markAllRead: () => set(s => {
    const next = s.notifications.map(n => ({ ...n, read: true }));
    saveToStorage(next);
    return { notifications: next, unreadCount: 0 };
  }),

  markRead: (id) => set(s => {
    const next = s.notifications.map(n => n.id === id ? { ...n, read: true } : n);
    saveToStorage(next);
    return { notifications: next, unreadCount: next.filter(n => !n.read).length };
  }),

  removeNotification: (id) => set(s => {
    const next = s.notifications.filter(n => n.id !== id);
    saveToStorage(next);
    return { notifications: next, unreadCount: next.filter(n => !n.read).length };
  }),

  clear: () => {
    saveToStorage([]);
    set({ notifications: [], unreadCount: 0 });
  },
}));
