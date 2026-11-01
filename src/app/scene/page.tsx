"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/Auth";
import { useEffect, useState } from "react";
import { SceneRunner } from "@/components/SceneRunner";
import { loadProfile, loadSetupDraft, type SetupDraft } from "@/lib/client/storage";
import { SetupSchema, type Profile } from "@/lib/schemas";

export default function ScenePage() {
  return (
    <RequireAuth>
      <ScenePageInner />
    </RequireAuth>
  );
}

function ScenePageInner() {
  const router = useRouter();
  const [data, setData] = useState<{ profile: Profile; draft: SetupDraft } | null>(null);

  useEffect(() => {
    const profile = loadProfile();
    const draft = loadSetupDraft();
    if (!profile) return router.replace("/");
    if (!draft?.claims?.length || !draft.gap || !SetupSchema.safeParse(draft).success) return router.replace("/setup");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage once on mount
    setData({ profile, draft });
  }, [router]);

  if (!data) return null;
  return (
    <ConversationProvider>
      <SceneRunner profile={data.profile} draft={data.draft} />
    </ConversationProvider>
  );
}
