import { createContext, useContext, useState } from "react";
import { session } from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [s, setS] = useState(session.get());
  const value = {
    session: s,
    user: s?.user,
    isTemp: s?.scope === "change_password",
    isOtp: s?.scope === "otp",
    signIn: (token, user, scope = "full") => { const n = { token, user, scope }; session.set(n); setS(n); },
    signOut: () => { session.clear(); setS(null); },
    updateUser: (patch) => setS((cur) => { if (!cur) return cur; const n = { ...cur, user: { ...cur.user, ...patch } }; session.set(n); return n; }),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
