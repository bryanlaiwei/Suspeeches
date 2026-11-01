import { Agentboxd, AgentboxdError } from "agentboxd";
import { castFor, PARTY_CAST, PRESETS } from "./presets";
import { env } from "./env";
import type { Session } from "./sessions";

/**
 * Email channel for the in-character follow-up the character sends after the scene.
 * Swap the implementation behind this interface freely.
 */
export interface HandlerChannel {
  readonly enabled: boolean;
  /** The in-character follow-up from the character themself (s.followup). */
  sendFollowup(s: Session): Promise<void>;
}

/** Characters that get their own inbox; custom characters share one renamed per send. */
const NAMED_SENDERS = new Set([...PRESETS.map((p) => p.character), ...PARTY_CAST.map((c) => c.name)]);

class NoopHandler implements HandlerChannel {
  readonly enabled = false;
  async sendFollowup() {}
}

class AgentboxdHandler implements HandlerChannel {
  readonly enabled = true;
  private client = new Agentboxd({ apiKey: env.agentboxdKey });
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
}

let handler: HandlerChannel | null = null;
export function getHandler(): HandlerChannel {
  handler ??= env.agentboxdKey ? new AgentboxdHandler() : new NoopHandler();
  return handler;
}

/** Send the follow-up for a finished game right now, to the given address (debrief "Send" button). */
export async function sendFollowupNow(s: Session, email: string): Promise<void> {
  const h = getHandler();
  if (!h.enabled) throw new Error("Email isn't set up on this server (AGENTBOXD_API_KEY is missing).");
  if (!s.followup) throw new Error("The follow-up isn't written yet. Try again in a few seconds.");
  if (!s.profile.email) s.profile = { ...s.profile, email };
  s.handler.enabled = true;
  s.handler.error = null;
  await h.sendFollowup(s);
}

/** Fire-and-forget wrapper: handler problems must never break the game. */
export function runHandler(s: Session, task: (h: HandlerChannel) => Promise<void>): void {
  const h = getHandler();
  if (!h.enabled || !s.profile.email) return;
  s.handler.enabled = true;
  task(h).catch((err) => {
    s.handler.error = err instanceof AgentboxdError ? `${err.status} ${err.code}: ${err.message}` : String(err);
    console.error("[handler]", s.handler.error);
  });
}
