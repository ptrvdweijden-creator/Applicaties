import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, setUnauthorizedHandler, TOKEN_KEY } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { MUTATION_ROLES, MutationType, User } from "@/src/types";
import { storage } from "@/src/utils/storage";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  canMutate: (t: MutationType) => boolean;
};

const Ctx = createContext<AuthCtx>(null as never);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    queryClient.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
    (async () => {
      const token = await storage.secureGet<string | null>(TOKEN_KEY, null);
      if (token) {
        try {
          setUser(await api<User>("/auth/me"));
        } catch {
          await storage.secureRemove(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = async (email: string, password: string) => {
    const res = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email: email.trim(), password },
    });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
  };

  const isAdmin = user?.role === "admin";
  const canMutate = (t: MutationType) => !!user && MUTATION_ROLES[t].includes(user.role);

  return <Ctx.Provider value={{ user, loading, login, logout, isAdmin, canMutate }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
