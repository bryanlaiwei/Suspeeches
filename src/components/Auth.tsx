"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { authEnabled, supabase } from "@/lib/client/supabase";

/** Current Supabase user. `user` is null when signed out (or accounts are off). */
export function useAuth() {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: authEnabled });
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setState({ user: data.session?.user ?? null, loading: false }));
    const { data } = sb.auth.onAuthStateChange((_event, session) => setState({ user: session?.user ?? null, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

/** Renders children only for signed-in players; sends everyone else to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const blocked = authEnabled && !loading && !user;
  useEffect(() => {
    if (blocked) router.replace("/login");
  }, [blocked, router]);
  if (authEnabled && (loading || !user)) return null;
  return <>{children}</>;
}
