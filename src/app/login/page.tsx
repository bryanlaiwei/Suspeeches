"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { Button, Card, cx, ERROR_NOTE, FictionNote, Input, Label, Shell } from "@/components/ui";
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
    if (!authEnabled || (!loading && user)) router.replace("/");
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
      return;
    }
    router.replace("/");
  }

  return (
    <Shell>
      <div className="mx-auto grid w-full max-w-4xl flex-1 items-center gap-10 pt-6 md:grid-cols-2">
        <div>
          <h1 className="text-5xl font-black leading-[1.02] tracking-tight">
            Don&apos;t give
            <br />
            yourself <span className="text-red">away.</span>
          </h1>
          <p className="mt-4 font-bold text-muted">
            Sign in to save your real profile and every debrief. Your profile is only ever shown to the hidden judge.
          </p>
        </div>
        <Card>
          <div className="mb-5 flex gap-1 rounded-2xl bg-lav p-1 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => (setMode(m), setError(null))}
                className={cx("flex-1 rounded-xl py-2 font-extrabold transition", mode === m ? "bg-white text-purple shadow-[0_2px_0_var(--lav-2)]" : "text-muted hover:text-ink")}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <Label>Email</Label>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block">
              <Label hint={mode === "signup" ? "at least 6 characters" : undefined}>Password</Label>
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className={ERROR_NOTE}>{error}</p>}
            {notice && <p className="rounded-2xl bg-green-soft px-4 py-3 text-sm font-bold text-[#2f6b00]">{notice}</p>}
            <Button type="submit" className="w-full py-3" disabled={busy}>
              {busy ? "One sec…" : mode === "signin" ? "Sign in →" : "Create account →"}
            </Button>
          </form>
          <FictionNote className="mt-5" />
        </Card>
      </div>
    </Shell>
  );
}
