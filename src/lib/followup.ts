import { formatClaims, formatScene, formatTranscript, characterName } from "./context";
import { env, llmMock } from "./env";
import { structuredCall } from "./llm";
import { castFor, isGroupScenario, voiceLabel } from "./presets";
import { fill, loadPrompt, render } from "./prompts";
import { FollowupRawSchema, type FollowupRaw } from "./schemas";
import type { Session } from "./sessions";
import type { Debrief, Followup } from "./types";

/** The character sheet the NPC actually played from, with the scene's details filled in. */
function characterSheet(s: Session): string {
  const { setup } = s;
  const body = loadPrompt(`npc/${setup.scenarioId}.v1`).body;
  return fill(body, {
    character_name: setup.custom?.name ?? "",
    character_personality: setup.custom?.personality ?? "",
    character_setting: setup.custom?.setting || "A casual first meeting.",
    cast:
      setup.group?.characters
        .map((c) => `- ${c.name} (<${voiceLabel(c.voiceId)}>): ${c.personality}${c.expertise ? ` Knows: ${c.expertise}.` : ""}`)
        .join("\n") ?? "",
    setting: setup.group?.setting || "A casual group conversation.",
  });
}

/**
 * Write the in-character follow-up email (offer, intro, invite, brush-off...) based on the scene,
 * the goal and how the player did. Never throws: returns null if it can't be written.
 */
export async function buildFollowup(s: Session, d: Debrief): Promise<Followup | null> {
  const cast = castFor(s.setup);
  const raw: FollowupRaw = llmMock() ? mockFollowup(s, d) : await generate(s, d).catch(() => mockFollowup(s, d));

  const senderName =
    (s.status === "caught" ? s.caughtBy : null) ??
    cast.find((c) => c.name.toLowerCase() === raw.sender.trim().toLowerCase())?.name ??
    cast.find((c) => raw.sender.toLowerCase().includes(c.name.toLowerCase()))?.name ??
    s.caughtBy ??
    cast[0].name;
  return {
    sender: senderName,
    subject: raw.subject.trim().slice(0, 120),
    body: raw.body.trim(),
    goalReached: raw.goal_reached && s.status !== "caught" && d.endReason !== "left",
    sentTo: null,
    fromAddress: null,
  };
}

/** The one kind of email this scene's ending calls for. The model never picks the case itself. */
function instructionFor(s: Session, d: Debrief): string {
  const goal = s.setup.goal;
  if (d.outcome === "caught") {
    return [
      `The player was caught: ${d.caughtBy ?? characterName(s.setup)} decided their story didn't add up.`,
      `Write a short, polite rejection from ${d.caughtBy ?? "the character who caught them"}. Say clearly that you won't be moving forward with what they wanted (${goal}).`,
      "Hint at the one specific thing that didn't add up, in the character's own words (use the biggest tells).",
      'No next steps, no requests for more information, no "I\'d love to hear more", no invitation to follow up.',
      "Set goal_reached to false.",
    ].join("\n");
  }
  if (d.endReason === "left") {
    return [
      "The player hung up and left the conversation early.",
      "Write a short, slightly puzzled note reacting to them leaving abruptly, in character. Don't offer what they wanted.",
      "Set goal_reached to false.",
    ].join("\n");
  }
  return [
    "The player kept their story together until the time ran out.",
    `Set goal_reached to true only if the transcript shows the character(s) actually granted the goal or clearly intended to.`,
    "If goal_reached is true: follow through on the goal with concrete, friendly next steps (a time slot, an introduction, an address and time), and mention one specific thing the player said that impressed you.",
    "If goal_reached is false: polite and noncommittal; mention one thing you liked and one thing you'd still want to hear more about.",
  ].join("\n");
}

async function generate(s: Session, d: Debrief): Promise<FollowupRaw> {
  const cast = castFor(s.setup);
  const outcome = d.outcome === "caught" ? `caught${d.caughtBy ? ` by ${d.caughtBy}` : ""}` : d.endReason === "left" ? "walked out early" : "survived";
  const { data } = await structuredCall({
    label: "followup",
    model: env.gapModel,
    system: render("followup.v1", {
      character_sheet: characterSheet(s),
      senders: cast.map((c) => `- ${c.name}: ${c.title}`).join("\n"),
      alias: s.setup.alias,
      claims: formatClaims(s.setup.claims),
      scene: formatScene(s.setup),
      goal: s.setup.goal,
      instruction: instructionFor(s, d),
      outcome,
      end_reason: d.endReason,
      suspicion_line: d.finalByCharacter
        ? `How suspicious each of them ended up (0 trusting, 100 sure it's a lie): ${Object.entries(d.finalByCharacter)
            .map(([n, v]) => `${n} ${v}`)
            .join(", ")}`
        : `How suspicious ${characterName(s.setup)} ended up (0 trusting, 100 sure it's a lie): ${d.finalSuspicion}`,
      claim_verdicts: d.claims.map((c) => `${c.claim} → ${c.verdict}`).join("; "),
      tells: d.spikes.map((sp) => sp.reason).join("; ") || "none",
      transcript: formatTranscript(s.transcript, characterName(s.setup), 60),
    }),
    user: "Write the follow-up email.",
    schema: FollowupRawSchema,
    maxTokens: 2000,
    effort: "low",
  });
  return data;
}

function mockFollowup(s: Session, d: Debrief): FollowupRaw {
  const cast = castFor(s.setup);
  const sender = d.caughtBy ?? cast[0].name;
  const caught = d.outcome === "caught";
  return {
    goal_reached: !caught && d.endReason === "npc_ended",
    sender,
    subject: caught ? "Thanks for your time" : `Great meeting you, ${s.setup.alias}`,
    body: caught
      ? `Hi ${s.setup.alias},\n\nThanks for taking the time today. A few parts of your story didn't quite line up for me, so I don't think this is the right fit right now.\n\nBest of luck,\n${sender}`
      : `Hi ${s.setup.alias},\n\nReally enjoyed our chat. ${isGroupScenario(s.setup.scenarioId) ? "We'd love to see you again soon." : "Let's keep the conversation going."}\n\nTalk soon,\n${sender}`,
  };
}
