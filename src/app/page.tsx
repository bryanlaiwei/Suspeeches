"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { RequireAuth } from "@/components/Auth";
import { Shell } from "@/components/ui";
import { fetchProfile } from "@/lib/client/profileStore";

/** Entry point: players with a saved profile go straight to setup; new players fill it in once. */
export default function Home() {
  return (
    <RequireAuth>
      <Route />
    </RequireAuth>
  );
}

function Route() {
  const router = useRouter();
  useEffect(() => {
    void fetchProfile().then((p) => router.replace(p ? "/setup" : "/account"));
  }, [router]);
  return (
    <Shell>
      <div className="flex flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
      </div>
    </Shell>
  );
}
