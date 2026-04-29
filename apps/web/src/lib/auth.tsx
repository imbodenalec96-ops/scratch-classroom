import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@scratch/shared";
import { api } from "./api.ts";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginAsStudent: (id: string, password: string) => Promise<void>;
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

  // Keep-alive ping every 60s while a user is logged in — touches the
  // Neon DB via /api/ping so it doesn't hibernate while the app is open.
  // Without this, every cold Vercel instance pays a ~10s wake-up tax,
  // which makes the dashboard feel broken under sporadic load.
  useEffect(() => {
    if (!user) return;
    const ping = () => {
      const apiBase = (import.meta as any)?.env?.VITE_API_BASE ||
        (window.location.hostname === "localhost"
          ? "http://localhost:4000/api"
          : "https://scratch-classroom-api-td1x.vercel.app/api");
      fetch(`${apiBase}/ping`, { keepalive: true }).catch(() => {});
    };
    ping();
    const iv = setInterval(ping, 60_000);
    return () => clearInterval(iv);
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    localStorage.setItem("token", res.token);
    setUser(res.user);
  }, []);

  const loginAsStudent = useCallback(async (id: string, password: string) => {
    const res = await api.studentLogin(id, password);
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
