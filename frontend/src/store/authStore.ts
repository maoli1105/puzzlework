import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string, refreshToken: string) => void;
  /** /users/me を再取得して store を更新。plan / company_name の鮮度を保つ。 */
  refreshUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>(() => ({
  user: null,
  token: localStorage.getItem('token'),

  setAuth: (user, token, refreshToken) => {
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    useAuthStore.setState({ user, token });
  },

  refreshUser: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      // 動的 import で循環依存を回避
      const { users } = await import('../services/api');
      const user: User = await users.me();
      useAuthStore.setState({ user });
    } catch {
      // refresh 失敗は静かに無視（logout は呼ばない）
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    useAuthStore.setState({ user: null, token: null });
    window.location.href = '/login';
  },
}));
