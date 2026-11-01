# Sus — build plan

> "Don't give yourself away." A 1-on-1 voice game: you fake a cover story to an AI character while a hidden judge watches for tells.

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 (App Router) + TypeScript + Tailwind v4, one repo |
| NPC (ears, brain, mouth) | ElevenLabs Agents via `@elevenlabs/react` (WebRTC, `conversationToken` minted server-side) |
| Judge / gap estimator / claim suggester / summarizer | Anthropic SDK (`@anthropic-ai/sdk`) structured outputs + zod |
| Handler inbox | Agentboxd official TS client (`agentboxd`) |
| State | In-memory `Map` per session id on the server; profile in `localStorage` |
| Deploy | Render web service (`render.yaml`), HTTPS from Render for mic access |

## Roles (strictly separated)

```
            ┌───────────── browser ─────────────┐
 mic ──────▶│ ElevenLabs agent (STT → LLM → TTS) │──▶ speaker
            │   knows: character sheet +        │
            │          cover story ONLY         │
            └──────┬───────────────▲────────────┘
     onMessage     │               │ sendContextualUpdate(next_probe hint)
     (user/agent   ▼               │
      transcript)  POST /api/session/:id/event ──▶ Judge (Anthropic, JUDGE_MODEL)
                                   ▲                 sees: real profile + claims +
                                   │                 transcript + timing signals
                    suspicion, reasons, hint ◀──────┘ (clamped, zod-validated)
```

* **NPC** — one ElevenLabs agent per preset (recruiter, networking) plus one "custom" agent with prompt/first-message/voice overrides enabled. Cover story arrives as `dynamicVariables` (`{{cover_story}}`, `{{alias}}`, `{{scene_goal}}`). The real profile never leaves our server except to Anthropic.
* **Judge** — runs per user turn, in parallel with the NPC (client fires the request and keeps talking). Server serializes judge calls per session, clamps `delta` to [-15, 25], validates with zod, retries once.
* **Gap estimator** — before the scene: how far the claims are from the real profile → difficulty multiplier 1.0–3.0.
* **Summarizer** — once at the end → debrief JSON. Server overwrites authoritative numbers (outcome, final suspicion, gap, score).

## Folder layout

```
prompts/                 versioned prompt files (*.v1.md)
  npc/                   character sheets (frontmatter = agent config)
  judge.v1.md  gap.v1.md  suggest.v1.md  summarizer.v1.md
scripts/
  create-agents.ts       creates the 4 ElevenLabs agents, prints env lines
  test-judge.ts          fixed transcript → judge → schema + clamp checks
  fixtures/transcript.json
src/lib/                 server + shared logic (env, schemas, llm, judge, gap, sessions, scoring, timing, handler)
src/lib/client/          browser-only helpers (storage, sound, api)
src/components/          Avatar, SuspicionBar, Transcript, Timeline, ShareCard, UI bits
src/app/                 / (profile), /setup, /scene, /debrief, /api/*
```

## Game rules

* Suspicion 0–100, starts at 15. `suspicion = clamp(suspicion + delta)`. At 100 → **caught**, scene ends.
* **Survived** if the timer runs out or the NPC ends the call (it hangs up via `end_call` when the scene goal is met) with suspicion < 100. Leaving early = "walked out" (half credit).
* Delivery signals derived from transcript text + client timestamps: response latency (agent stopped speaking → VAD says user started), speech duration, words/min, filler-word rate. No audio analysis.
* Score = `survival (1000 survived / 500 walked out / 0–250 caught by time held) × gap multiplier (1–3) × low-suspicion bonus (1 + (100 − avg)/100)`.

## API surface

| Route | Purpose |
| --- | --- |
| `GET /api/health` | liveness + which integrations are configured |
| `POST /api/suggest` | claim suggestions from profile (GAP_MODEL) |
| `POST /api/gap` | larp-gap estimate (GAP_MODEL) |
| `POST /api/session` | create session, mint ElevenLabs token, send handler brief |
| `GET /api/session/:id` | session state |
| `POST /api/session/:id/event` | transcript event; user turns are judged |
| `POST /api/session/:id/end` | end (timeout / npc_ended / left / caught) |
| `POST /api/session/:id/debrief` | run summarizer once, email debrief |

## Build order

1. Skeleton, env handling, shared types + zod schemas, prompts folder.
2. Judge, gap, suggester, summarizer pipelines + `npm run test:judge`.
3. ElevenLabs integration: `npm run agents:create`, token route, `ConversationProvider` scene driver streaming transcript events.
4. Live scene end to end: voice in/out, parallel judge, animated bar, sound cue, caught/survived.
5. Profile, setup (presets + custom), debrief (timeline, verdicts, replay, share card PNG).
6. `render.yaml`, README, `.env.example`.
7. Agentboxd handler inbox (brief before, debrief after), behind a `HandlerChannel` interface.

## Dev aid

`MOCK_MODE=1` (or missing keys) → canned/heuristic LLM results and a scripted NPC (browser speech synthesis + a dev text box). Development only; it is labelled as such in the UI.
