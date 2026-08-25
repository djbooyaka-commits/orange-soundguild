import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { claimReferral } from "@/lib/api/referrals.functions";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the same `user` object identity while the signed-in user doesn't change,
  // so background token refreshes (e.g. when returning to the tab) don't make the
  // whole page re-run its data effects and look like a reload.
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
      // Credit the artist whose track share link brought this user in.
      // Fires for both email confirmation and Google OAuth returns.
      if (event === "SIGNED_IN" && s?.user) {
        try {
          const code = window.sessionStorage.getItem("ref_code");
          if (code) {
            claimReferral({ data: { code } })
              .catch(() => {})
              .finally(() => {
                try {
                  window.sessionStorage.removeItem("ref_code");
                } catch {
                  /* ignore */
                }
              });
          }
        } catch {
          /* ignore */
        }
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
