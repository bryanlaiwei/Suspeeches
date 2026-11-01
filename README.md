# Suspeeches

**Don't give yourself away.** A voice game for LarpHacks: you store your real profile, pick a cover story, then talk out loud to an AI character who only knows your claims. A hidden judge scores every turn, the suspicion bar above the character's head moves live, and at 100 you're caught. Survive the clock (or get the character to wrap up happy) and you get a debrief, a score and a share card.

> All characters are fictional. Suspeeches is for practice and entertainment only.

The name is suspicious + speeches. The look: purple stage, Nunito and Bricolage Grotesque, chunky 3D buttons. Characters are the drawn SVG faces in `src/components/Avatar.tsx`: the mouth moves with their voice, and eyes, brows and cheeks get more suspicious as their bar rises. During a call each character has their own suspicion bar, and only the latest line from each side is on screen; the full transcript is on the debrief.

See [PLAN.md](PLAN.md) for the architecture and build order.

## How it works

| Role | Runs on | Knows |
| --- | --- | --- |
| **NPC** (Dana the recruiter, Priya the founder, or your custom character) | An ElevenLabs agent: its own speech-to-text, LLM and voice | Its character sheet + your cover story (passed as dynamic variables). Never your real profile. |
| **Judge** | Anthropic `JUDGE_MODEL`, after every user turn, in parallel with the NPC | Real profile, cover story, transcript, timing signals |
| **Gap estimator** | Anthropic `GAP_MODEL`, before the scene | Real profile + cover story → difficulty multiplier ×1.0–3.0 |
| **Summarizer** | Anthropic `SUMMARY_MODEL`, once at the end | Everything → debrief JSON |

* The judge returns strict JSON (`delta`, `reasons`, `categories`, `claims_status`, `next_probe`). The server validates it with zod, clamps `delta` to [-15, 25], and retries once on invalid output; if both tries fail, the turn counts as neutral so the scene keeps going.
* Delivery signals come from the transcript and client timestamps, not audio: response latency (NPC stops talking → voice activity starts), speaking time, words per minute, filler-word rate.
* The judge's `next_probe` goes to the NPC with ElevenLabs `sendContextualUpdate`, which adds context without triggering a reply. The NPC is told to use these notes silently and never to mention scores.
* **Scoring:** suspicion starts at 20. The judge scores each turn on its own (vague answers about +6, dodges +8 to +16, specific answers −5 to −10, an answer that clears up an earlier doubt −10 to −13). The server then applies the same rules both ways: the larp gap scales the change (×1.0 at gap 0 up to ×1.67 at gap 100), streaks add ±2 per answer in a row in the same direction (max 3), and a good answer right after a spike also clears 40% of that spike. Each turn is capped at −20 / +30, and the event popover shows the breakdown. Tune it in `src/lib/scoring.ts`.
* **Caught = hang-up:** at 100 the character gets a private "you've made up your mind" note, says a cold goodbye and ends the call (it falls back to hanging up after 15 s).
* **Mood:** the NPC's tone follows suspicion in four bands: warm (<35), curious (35–59), skeptical (60–79) and cold (80+). When the band changes, the server sends the NPC a mood note from `prompts/npc/_moods.v1.md` as a contextual update. It changes tone only and never mentions numbers.
* **Silence penalty:** if it's your turn and you say nothing, a countdown appears. At 8 s of silence suspicion goes up by 6, then by 8 and 10 every further 6 s. The browser reports the silence, and the server checks the timing and applies the penalty (`/api/session/:id/silence`; tune it with the constants in `src/lib/scoring.ts`). The judge is told not to count the same pause again.
* Score = survival (1000 survived, 500 walked out, 0–250 caught based on time held) × gap multiplier × low-suspicion bonus (1 + (100 − average suspicion)/100).

## Group scenes

Besides the 1-on-1 characters (Dana the recruiter, Priya the founder, or your own), there are two group scenes where up to three people talk to you at once:

* **Startup interview (preset):** a panel at Lumen, a fictional fintech: Maya the CTO, Theo the CEO and Jordan the head of design.
* **Custom group:** 2–3 characters you write (name, personality, voice) plus a setting.

Each group is a single ElevenLabs agent using **multi-voice**: the agent wraps each character's words in a voice tag (`<Maya>…</Maya>`), and ElevenLabs speaks each tag in that character's voice. The tags come through to the browser in the agent's text (checked live), so the app splits each response into one transcript line per character and animates only the face that is talking. Group scenes connect over WebSocket (signed URL) rather than WebRTC, because only that transport reports when each audio chunk starts playing, with per-character timings; the app switches faces at the exact character where the next speaker's part begins.

**Each character asks about what they know**: Maya takes the engineering questions, Jordan the design ones, and Theo mostly comments and banters, asking only the odd business question. Usually one or two of them speak per turn, rotating so nobody goes quiet for long, and the judge's next-question hint names which character should ask it. Custom group characters ask about their "knows a lot about" field. ElevenLabs expressive tags like `[curious]` are performed by the voice and stripped from the transcript.

**Each character has their own suspicion bar**, based on their expertise (Maya: engineering; Theo: business, metrics and culture; Jordan: design; custom characters: whatever you write under "knows a lot about"). The judge returns a delta per listener: full strength for claims inside their expertise, about a third outside it, while contradictions, pauses and hedging are noticed by everyone. Each bar gets its own larp-gap scaling, streaks and redemption, and each character gets their own mood. **If any one bar hits 100 you're caught**, and that character ends the conversation. The custom group agent has six voice tags, one per premade voice; at scene start the server tells it which character uses which tag. Prompts: `prompts/npc/party.v1.md`, `prompts/npc/group.v1.md`, `prompts/npc/_group_rules.v1.md`.

## Accounts and history

You fill in your real profile once (Profile in the top bar, `/account`); after that, signing in takes you straight to setup.

Players sign up with email + password (Supabase Auth). Their real profile and every finished game (debrief, transcript, timeline) are saved to Supabase under row-level security, so each player only sees their own. The browser sends its Supabase access token to the API; `/api/session`, `/api/gap` and `/api/suggest` reject requests without a valid one, which also stops strangers from spending your API credits. `/history` lists past games, and debrief links keep working after a server restart.

Tables (`profiles`, `games`) live in the Supabase project `sus`. In the Supabase dashboard: **Authentication → Sign In / Providers → Email**, turn off **Confirm email** for a frictionless demo (the built-in mailer is rate-limited), and add your Render URL under **Authentication → URL Configuration**.

## Run locally

Requires Node 20+ (22 recommended).

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
```

Without keys, `npm run dev` falls back to **mock mode** (a development aid): heuristic judge, canned debrief, and a scripted NPC voiced by your browser's speech synthesis with a typed "dev input" instead of the mic. Force it with `MOCK_MODE=1`.

### Create the ElevenLabs agents (once)

```bash
npm run agents:create              # creates all five agents (recruiter, networking, custom, party, group)
npm run agents:create recruiter    # or just one
npm run agents:update              # after editing prompts/npc/*.md: push changes, keep the same IDs
```

This reads `prompts/npc/*.md` and calls `POST /v1/convai/agents/create` for each scenario with: character sheet + shared rules as the system prompt (with `{{alias}}`, `{{cover_story}}`, `{{scene_goal}}`, `{{time_limit_minutes}}` dynamic variables), the voice and LLM from the file's frontmatter, no hang-up tool (only the app ends a scene: the clock, getting caught, or you leaving), the client events the app listens to (`user_transcript`, `agent_response`, `vad_score`, …), and, for the custom agent only, the `tts.voice_id` override so players can pick a voice. It prints the `ELEVENLABS_AGENT_ID_*` lines to paste into `.env.local` and Render.

The agents are private: the server mints a short-lived WebRTC conversation token per scene (`GET /v1/convai/conversation/token`), so the ElevenLabs key never reaches the browser.

### Test the judge

```bash
npm run test:judge
```

Runs [a fixed transcript](scripts/fixtures/transcript.json) (a barista claiming to be a senior Go engineer) through the judge and checks: zod schema on every result, the delta clamp, suspicion bounds, claim mirroring, retry-once on invalid output, and the neutral fallback after two failures. Uses the real `JUDGE_MODEL` when `ANTHROPIC_API_KEY` is set, otherwise the mock judge.

Other checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Judge, gap estimator, claim suggester, summarizer |
| `JUDGE_MODEL` | no (default `claude-haiku-5-5`) | Per-turn judge; keep it fast and cheap |
| `GAP_MODEL` | no (default `claude-haiku-5-5`) | Larp-gap estimate and claim suggestions |
| `SUMMARY_MODEL` | no (default `claude-opus-5-5`) | End-of-scene debrief |
| `ELEVENLABS_API_KEY` | yes | Mint conversation tokens; create agents |
| `ELEVENLABS_AGENT_ID_RECRUITER` | yes | Agent for the recruiter preset |
| `ELEVENLABS_AGENT_ID_NETWORKING` | yes | Agent for the networking preset |
| `ELEVENLABS_AGENT_ID_CUSTOM` | for custom scenes | Agent with the voice override enabled |
| `ELEVENLABS_AGENT_ID_PARTY` | for the launch party | Multi-voice agent (Maya, Theo, Jordan) |
| `ELEVENLABS_AGENT_ID_GROUP` | for custom groups | Multi-voice agent with six voice tags |
| `AGENTBOXD_API_KEY` | no | Character follow-up emails after each scene |
| `PUBLIC_APP_URL` | no | Link in debrief emails (Render's `RENDER_EXTERNAL_URL` is used otherwise) |
| `NEXT_PUBLIC_SUPABASE_URL` | for accounts | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | for accounts | Supabase publishable key (safe to expose) |
| `MOCK_MODE` | no | `1` forces canned responses (development only) |

There is no NPC model variable: the NPC's LLM is chosen inside each ElevenLabs agent (`llm:` in `prompts/npc/*.md`, default `gemini-2.5-flash` for low voice latency).

## Deploy on Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. `render.yaml` defines one Node web service (`npm ci && npm run build`, `npm start`, health check `/api/health`).
3. Fill in the secrets Render prompts for (the `sync: false` vars above).
4. Open `https://<service>.onrender.com/api/health` and check every integration shows `true`.

Render serves HTTPS, which browsers require for microphone access. Sessions live in memory, so keep one instance; on the free plan the service sleeps when idle and in-flight scenes are lost (use the starter plan for demos).

## Agentboxd follow-up email

If `AGENTBOXD_API_KEY` is set, Suspeeches sends exactly one email per scene, always to the player's sign-in email: an **in-character follow-up** from the character's own inbox (Dana, Priya, Maya, Theo and Jordan each have one; custom characters share one that is renamed per send), seconds after the scene ends. It's written by `GAP_MODEL` from `prompts/followup.v1.md` using the transcript, the goal and how you did: reached the goal → a concrete next step (interview slot, investor intro, an offer); survived without it → noncommittal; caught → a cool brush-off that hints at what didn't add up (from whoever caught you in a group); walked out → a reaction to that. It ends with a footer saying it comes from a fictional character in a practice game.

The follow-up also appears on the debrief page, even with email off. Inboxes are created idempotently on `client_id` (`sus-npc-<name>`, `sus-npc-custom`). The sender sits behind the `HandlerChannel` interface in [src/lib/handler.ts](src/lib/handler.ts) and never blocks the game. Mind Agentboxd's send caps for new workspaces.

## Layout

```
prompts/              versioned prompts: npc/*.v1.md (agent configs), judge, gap, suggest, summarizer
scripts/              create-agents.ts, test-judge.ts, fixtures/
src/lib/              env, schemas (zod), llm (structured call + retry), judge, gap, summarize,
                      sessions (in-memory), scoring, timing, elevenlabs, handler, mock
src/lib/client/       storage (localStorage), sound cues (WebAudio), api
src/components/       Avatar, SceneRunner, CallScreen (live call), Shells, SuspicionBar, Transcript, Timeline, ShareCard, Auth, ui (theme kit)
src/app/              / · /login · /account (profile) · /setup · /scene · /debrief · /history · /api/*
```
