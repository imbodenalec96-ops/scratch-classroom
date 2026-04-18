import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@scratch/shared";
import { api } from "./api.ts";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginAsStudent: (id: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api.me().then(setUser).catch(() => localStorage.removeItem("token")).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    localStorage.setItem("token", res.token);
    setUser(res.user);
  }, []);

  const loginAsStudent = useCallback(async (id: string) => {
    const res = await api.studentLogin(id);
    localStorage.setItem("token", res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, role: string) => {
    const res = await api.register(email, password, name, role);
    localStorage.setItem("token", res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAsStudent, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
