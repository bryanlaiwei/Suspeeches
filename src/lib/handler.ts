import { Agentboxd, AgentboxdError } from "agentboxd";
import { characterName, fmtTime } from "./context";
import { castFor, PARTY_CAST, PRESETS } from "./presets";
import { env } from "./env";
import type { Session } from "./sessions";

/**
 * The "handler": a spy-movie contact with their own inbox. Emails the player a cover-story brief
 * before the scene and the debrief after. Swap the implementation behind this interface freely.
 */
export interface HandlerChannel {
  readonly enabled: boolean;
  sendBrief(s: Session): Promise<void>;
  sendDebrief(s: Session, appUrl: string): Promise<void>;
  /** The in-character follow-up from the character themself (s.followup). */
  sendFollowup(s: Session): Promise<void>;
}

/** Characters that get their own inbox; custom characters share one renamed per send. */
const NAMED_SENDERS = new Set([...PRESETS.map((p) => p.character), ...PARTY_CAST.map((c) => c.name)]);

class NoopHandler implements HandlerChannel {
  readonly enabled = false;
  async sendBrief() {}
  async sendDebrief() {}
  async sendFollowup() {}
}

class AgentboxdHandler implements HandlerChannel {
  readonly enabled = true;
  private client = new Agentboxd({ apiKey: env.agentboxdKey });
  private inbox: Promise<{ id: string; address: string }> | null = null;

  private getInbox() {
    // Idempotent on client_id, so every server instance shares one handler inbox.
    this.inbox ??= this.client.inboxes
      .create({ client_id: env.handlerClientId, display_name: "Your Handler (Sus)" })
      .then((i) => ({ id: i.id, address: i.address }))
      .catch((err) => {
        this.inbox = null;
        throw err;
      });
    return this.inbox;
  }

  private characterInboxes = new Map<string, Promise<{ id: string; address: string }>>();

  /** One inbox per preset character (idempotent on client_id); custom characters share one. */
  private async characterInbox(name: string, title: string) {
    const named = NAMED_SENDERS.has(name);
    const key = named ? `sus-npc-${name.toLowerCase()}` : "sus-npc-custom";
    const displayName = `${name} (${title})`.slice(0, 80);
    let p = this.characterInboxes.get(key);
    if (!p) {
      p = this.client.inboxes
        .create({ client_id: key, display_name: displayName })
        .then((i) => ({ id: i.id, address: i.address }));
      p.catch(() => this.characterInboxes.delete(key));
      this.characterInboxes.set(key, p);
    }
    const inbox = await p;
    if (!named) await this.client.inboxes.update(inbox.id, { display_name: displayName });
    return inbox;
  }

  async sendFollowup(s: Session) {
    const f = s.followup;
    if (!f) return;
    const who = castFor(s.setup).find((c) => c.name === f.sender);
    const inbox = await this.characterInbox(f.sender, who?.title ?? "Sus character");
    const text = [
      f.body,
      "",
      "—",
      `Sent from Sus, a practice game. ${f.sender} is a fictional character.`,
    ].join("\n");
    await this.client.messages.send(inbox.id, { to: s.profile.email, subject: f.subject, text }, { idempotencyKey: `followup-${s.id}` });
    f.sentTo = s.profile.email;
    f.fromAddress = inbox.address;
  }

  async sendBrief(s: Session) {
    const inbox = await this.getInbox();
    s.handler.address = inbox.address;
    const npc = characterName(s.setup);
    const text = [
      `Agent ${s.setup.alias},`,
      "",
      `You are about to meet ${npc}. Remember your cover:`,
      ...s.setup.claims.map((c) => `  • ${c}`),
      "",
      `Objective: ${s.setup.goal}`,
      `Time on the clock: ${fmtTime(s.setup.timeLimitSec)}`,
      `Larp gap: ${s.gap.gapScore}/100 (×${s.gap.multiplier}). ${s.gap.rationale}`,
      s.gap.hardestClaims.length ? `Watch out for: ${s.gap.hardestClaims.join("; ")}` : "",
      "",
      "Be specific. Don't fill silence with 'um'. Don't give yourself away.",
      "",
      "— Your Handler",
      "(Sus is a practice game. All characters are fictional.)",
    ].join("\n");
    await this.client.messages.send(
      inbox.id,
      { to: s.profile.email, subject: `Sus brief: your cover for ${npc}`, text },
      { idempotencyKey: `brief-${s.id}` },
    );
    s.handler.briefSent = true;
  }

  async sendDebrief(s: Session, appUrl: string) {
    const d = s.debrief;
    if (!d) return;
    const inbox = await this.getInbox();
    const text = [
      `Agent ${s.setup.alias},`,
      "",
      d.outcome === "caught" ? "You were made. Here's what happened." : "You walked out clean. Here's the report.",
      "",
      `"${d.headline}"`,
      `Score: ${d.score.toLocaleString()}  |  Final suspicion: ${d.finalSuspicion}/100  |  Larp gap: ${d.larpGap}/100`,
      "",
      "Claims:",
      ...d.claims.map((c) => `  • [${c.verdict.toUpperCase()}] ${c.claim} — ${c.note}`),
      "",
      "Biggest tells:",
      ...d.spikes.map((sp) => `  • ${fmtTime(sp.tSec)} +${sp.delta}: ${sp.reason}`),
      "",
      "For next time:",
      ...d.tips.map((t, i) => `  ${i + 1}. ${t}`),
      "",
      appUrl ? `Full debrief: ${appUrl}/debrief?id=${s.id} (available while the server keeps this session)` : "",
      "",
      "— Your Handler",
    ].join("\n");
    await this.client.messages.send(
      inbox.id,
      { to: s.profile.email, subject: `Sus debrief: ${d.outcome === "caught" ? "CAUGHT" : "SURVIVED"} (${d.score.toLocaleString()} pts)`, text },
      { idempotencyKey: `debrief-${s.id}` },
    );
    s.handler.debriefSent = true;
  }
}

let handler: HandlerChannel | null = null;
export function getHandler(): HandlerChannel {
  handler ??= env.agentboxdKey ? new AgentboxdHandler() : new NoopHandler();
  return handler;
}

/** Fire-and-forget wrapper: handler problems must never break the game. */
export function runHandler(s: Session, task: (h: HandlerChannel) => Promise<void>): void {
  const h = getHandler();
  if (!h.enabled || !s.setup.emailHandler || !s.profile.email) return;
  s.handler.enabled = true;
  task(h).catch((err) => {
    s.handler.error = err instanceof AgentboxdError ? `${err.status} ${err.code}: ${err.message}` : String(err);
    console.error("[handler]", s.handler.error);
  });
}
