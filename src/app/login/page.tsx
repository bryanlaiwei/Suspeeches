"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { StageShell } from "@/components/Shells";
import { Btn, cx, Face, Input, Label } from "@/components/ui";
import { fetchProfile } from "@/lib/client/profileStore";
import { authEnabled, supabase } from "@/lib/client/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authEnabled || (!loading && user)) void fetchProfile().then((p) => router.replace(p ? "/home" : "/account"));
  }, [user, loading, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res =
      mode === "signin"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/login` } });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    if (mode === "signup" && !res.data.session) {
      setNotice("Check your inbox to confirm your email, then sign in.");
      setMode("signin");
    }
  }

  return (
    <StageShell sparkles>
      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="animate-sus-pop w-full max-w-md rounded-[36px] bg-white p-8 text-ink shadow-[0_8px_0_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-4">
            <Face art="custom-female" expression="happy" size={72} />
            <div>
              <h1 className="text-3xl font-black leading-tight">{mode === "signin" ? "Welcome back, agent." : "New in town?"}</h1>
              <p className="font-bold text-muted">{mode === "signin" ? "Your aliases missed you." : "Make an account. Your secrets stay secret."}</p>
            </div>
          </div>
          <div className="mt-6 flex rounded-2xl bg-lav p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => (setMode(m), setError(null))}
                className={cx(
                  "flex-1 rounded-xl py-2.5 text-sm font-black uppercase tracking-widest transition",
                  mode === m ? "bg-white text-blue shadow-[0_2px_0_var(--lav-2)]" : "text-muted",
                )}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <Label>Email</Label>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block">
              <Label hint={mode === "signup" ? "6+ characters" : undefined}>Password</Label>
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm font-bold text-red">{error}</p>}
            {notice && <p className="rounded-2xl bg-green-soft px-4 py-3 text-sm font-bold text-green">{notice}</p>}
            <Btn type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "One sec…" : mode === "signin" ? "Let me in" : "Create my account"}
            </Btn>
          </form>
          <p className="mt-5 text-center text-xs font-bold text-muted">
            Characters email you a follow-up after each call, at this address.
          </p>
        </div>
      </div>
    </StageShell>
  );
}
