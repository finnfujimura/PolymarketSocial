import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  evmAddress: string;
  username: string;
  polymarketUserAddress?: string;
  avatarUrl: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  walletVerified: boolean;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  setWalletVerified: (verified: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      walletVerified: false,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (user) => set({ user }),
      setWalletVerified: (verified) => set({ walletVerified: verified }),
      logout: () => set({ token: null, user: null, walletVerified: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
