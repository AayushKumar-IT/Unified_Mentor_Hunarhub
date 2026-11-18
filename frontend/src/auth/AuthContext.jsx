import { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("/api/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function signIn(credentials) {
    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    });
    setUser(result.user);
    return result.user;
  }

  async function register(details) {
    const result = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(details)
    });
    setUser(result.user);
    return result.user;
  }

  async function signOut() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
