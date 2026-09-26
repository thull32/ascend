import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, display_name: string) => Promise<User>;
  logout: () => Promise<void>;
  update: (patch: Partial<Pick<User, "display_name" | "target_company" | "target_level" | "weekly_hours" | "preferred_language">> & { onboarded?: boolean }) => Promise<User>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<User>("/auth/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      async login(email, password) {
        const u = await api.post<User>("/auth/login", { email, password });
        setUser(u);
        return u;
      },
      async register(email, password, display_name) {
        const u = await api.post<User>("/auth/register", { email, password, display_name });
        setUser(u);
        return u;
      },
      async logout() {
        await api.post("/auth/logout");
        setUser(null);
      },
      async update(patch) {
        const u = await api.patch<User>("/auth/me", patch);
        setUser(u);
        return u;
      },
    }),
    [user, loading, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
