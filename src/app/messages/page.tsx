"use client";

import Link from "next/link";
import { useState } from "react";
import { RequireAuth } from "@/components/Auth";
import { AppShell } from "@/components/Shells";
import { cx, Face, Tag } from "@/components/ui";
import { timeAgo, useInbox, type InboxItem } from "@/lib/client/inbox";
import { markRead } from "@/lib/client/storage";

/** 05 Messages: call invites + every character's follow-up. */
export default function MessagesPage() {
  return (
    <RequireAuth>
      <AppShell>
        <Messages />
      </AppShell>
    </RequireAuth>
  );
}

function Messages() {
  const items = useInbox();
  const [open, setOpen] = useState<string | null>(null);
  const [readNow, setReadNow] = useState<Set<string>>(new Set());

  function toggle(item: InboxItem) {
    markRead(item.id);
    setReadNow((s) => new Set(s).add(item.id));
    setOpen((o) => (o === item.id ? null : item.id));
  }

  return (
    <div className="mx-auto w-full max-w-3xl pt-8">
      <h1 className="text-5xl font-black">Messages</h1>
      <p className="mt-1 font-bold text-muted">Call invites and what people said about you afterwards. 👀</p>
      <ul className="mt-8 space-y-4">
        {items === null && <li className="font-bold text-muted">Checking the mailbox…</li>}
        {items?.map((m) => {
          const unread = m.unread && !readNow.has(m.id);
          const isOpen = open === m.id;
          const body = (
            <div className="flex items-center gap-4">
              <Face art={m.art} expression={m.kind === "followup" && m.goalReached === false ? "suspicious" : "happy"} size={64} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg font-black">
                  {m.from} <span className="font-extrabold text-ink/80">· {m.role}</span>
                </div>
                <div className="truncate font-bold text-muted">{m.kind === "followup" ? m.subject : m.preview}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-xs font-bold text-muted">{timeAgo(m.at)}</span>
                {unread && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red text-xs font-black text-white">1</span>}
              </div>
            </div>
          );
          const cls = cx(
            "block rounded-3xl border-2 bg-white px-5 py-4 text-left transition",
            unread ? "border-blue shadow-[0_5px_0_var(--blue)]" : "border-lav-2 shadow-[0_5px_0_var(--lav-2)]",
          );
          return (
            <li key={m.id}>
              {m.kind === "invite" ? (
                <Link href={m.href} className={cls} onClick={() => markRead(m.id)}>
                  {body}
                </Link>
              ) : (
                <button type="button" className={cx(cls, "w-full")} onClick={() => toggle(m)}>
                  {body}
                  {isOpen && (
                    <div className="animate-sus-pop mt-4 rounded-2xl bg-lav p-5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-black">{m.subject}</span>
                        <Tag color={m.goalReached ? "bg-green text-white" : "bg-red text-white"}>{m.goalReached ? "GOAL REACHED" : "GOAL MISSED"}</Tag>
                      </div>
                      <p className="whitespace-pre-wrap font-semibold leading-relaxed">{m.body}</p>
                      <Link href={m.href} className="mt-3 inline-block text-sm font-black uppercase tracking-widest text-blue hover:underline">
                        See how that call went →
                      </Link>
                    </div>
                  )}
                </button>
              )}
            </li>
          );
        })}
        <li>
          <Link
            href="/cover"
            className="flex items-center gap-4 rounded-3xl border-2 border-dashed border-lav-2 px-5 py-4 font-black text-muted transition hover:bg-white"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green text-2xl text-white shadow-[0_4px_0_var(--green-dark)]">+</span>
            Start a new scenario
          </Link>
        </li>
      </ul>
      {items?.length === 0 && <p className="mt-4 text-sm font-bold text-muted">Nothing yet. Play a call and the characters will write back.</p>}
    </div>
  );
}
