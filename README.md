<p align="center">
  <img src="docs/suspeeches-mark.svg" alt="Suspeeches" width="96" />
</p>

# [Suspeeches](https://suspeeches.vercel.app)

Fake it till you make it, out loud! Join a conversation where characters can smell a larp from a mile away. A sus-meter on their head shows how suspicious you are, and trust me, you don't want it to reach 100%.

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Zod-3E67B1?style=flat&logo=zod&logoColor=white" alt="Zod" />
  <img src="https://img.shields.io/badge/ElevenLabs_Agents-000000?style=flat&logo=elevenlabs&logoColor=white" alt="ElevenLabs Agents" />
  <img src="https://img.shields.io/badge/Claude_API-D97757?style=flat&logo=anthropic&logoColor=white" alt="Claude API" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white" alt="Vercel" />
</p>

> [!NOTE]
> Built within an afternoon at **LarpHacks 2026**. Everyone in the game is made up, and it's for practice and fun only. Please don't larp on real people, unless you can ace the game.

## The problem

Holding a story together under pressure is a real skill, whether it's an interview, a networking chat or a room full of strangers, and the only place to practice is the real thing, where a slip costs you the job, the deal or your dignity. Suspeeches gives you a safe place to get caught: characters who push back like real people, and a debrief that tells you exactly which answer gave you away.

## How it fits together

```mermaid
flowchart LR
  you["You (mic)"] <--> npc["ElevenLabs agent<br/>(the characters' voices)"]
  you --> app["Next.js app"]
  app --> judge["Claude judge<br/>(every turn)"]
  judge --> app
  app -- "private notes" --> npc
  app --> db["Supabase<br/>(profiles, games)"]
  app -- "end of call" --> summary["Claude summarizer"]
```

The characters are ElevenLabs agents with their own speech-to-text, language model and voice. They only ever see your cover story. Group scenes use one multi-voice agent that tags each character's lines, so the app knows whose face to move.

After each of your turns, a Claude judge reads your real profile, your cover story, the transcript and your timing (pauses, filler words, speaking speed) and returns a suspicion change for each listener. The server validates it, applies the scoring rules, and quietly passes the next question and the character's new mood back to the agent. The characters never mention numbers. When the call ends, a second Claude call writes the debrief.

## How suspicion works

Suspicion starts at 20 for every character. Specific answers lower it, vague ones and dodges raise it, and contradictions or long silences raise it for everyone. Each character judges what they know: in the panel, Maya catches engineering claims and Jordan catches design ones. The bigger the gap between the real you and your cover story, the faster suspicion moves, and the higher your score multiplier.

| Over their head | Suspicion | How they sound |
|---|---|---|
| Buying it | under 35 | Warm |
| Curious | 35–59 | Curious, asks for detail |
| Skeptical | 60–79 | Pushes back |
| Onto you | 80+ | Cold |

The call ends in one of two ways: anyone hits 100 (you're caught) or the clock runs out (you made it). You can also hang up and walk out.

## What you can do

**Set up:**

- Sign up with email and password, and save your real profile once. Only the hidden judge sees it.
- Pick a scene: Dana's recruiter screen, a networking chat with Priya, the startup interview with Maya, Theo and Jordan, or write your own character or group.
- Write your cover story, or get claims suggested from your profile. Save it to see your larp gap.
- Choose 2.5, 5 or 10 minutes.

**Play:**

- Talk on a video-call screen, with each character's status and suspicion level (sus-meter) over their head.
- Watch faces and tones change as they get suspicious. 

**Afterwards:**

- Read the debrief: the result and score, a suspicion timeline you can click into, claim-by-claim verdicts, three tips and the full transcript.
- See past games on your profile.

## Project structure

| Path | Role |
|---|---|
| [`src/app`](src/app) | Pages (sign-in, profile, setup, scene, debrief) and the API routes |
| [`src/components`](src/components) | Call screen, scene runner, faces, timeline, transcript and the theme kit |
| [`src/lib`](src/lib) | Judge, scoring, larp gap, summarizer, sessions and ElevenLabs |
| [`prompts`](prompts) | Prompts for the judge, gap, summarizer and every character, compiled into `src/lib/prompts.generated.ts` |
| [`scripts`](scripts) | Creates and updates the ElevenLabs agents |
| [`supabase`](supabase) | Database schema and row-level-security policies for profiles and games |

## Run it locally

You need Node.js 22, plus API keys for Anthropic and ElevenLabs. Supabase (accounts) is optional.

Copy `.env.example` to `.env.local` and fill it in. Do not commit `.env.local`.

For accounts, create a Supabase project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor, and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the server-only `SUPABASE_SECRET_KEY` (only the server saves games, so players can read their history but can't write scores into it). The row-level-security policies in that file are what keep each player's profile and history private, so don't skip them.

```bash
npm install
npm run agents:create   # only for your own ElevenLabs account: creates the agents, records them in src/lib/agents.json
npm run dev             # http://localhost:3000
```

The agent IDs are committed in [`src/lib/agents.json`](src/lib/agents.json). They aren't secret: the agents are private, so starting a conversation needs a token minted with your API key. There's nothing to paste. If you use your own ElevenLabs account, `npm run agents:create -- --force` makes new agents and rewrites the file.

### Adding a scenario

Every scenario is one entry in [`src/lib/scenarios.ts`](src/lib/scenarios.ts): its label, character, blurb, goal, avatar and agent name. The zod schema, setup screen, health check and agent script all read it. To add one:

1. Add the entry to `SCENARIOS`.
2. Write `prompts/npc/<id>.md`: the character sheet, with `voice_id`, `llm` and `first_message` (plus `voices` for a multi-voice panel) in its frontmatter. Typecheck fails until it exists.
3. Run `npm run agents:create <id>` and commit `src/lib/agents.json`.

### Prompts

Every prompt is a Markdown file in `prompts/`, compiled into `src/lib/prompts.generated.ts` before `dev`, `build`, `typecheck` and `test`. Code renders prompts by name, so a wrong name or a missing `{{variable}}` fails `npm run typecheck` instead of a live request.

The character prompts live only in the repo. On every call the app sends each character's prompt and first message to ElevenLabs as overrides, so editing `prompts/npc` goes live on the next deploy. The agents only hold the voice, LLM and settings from each file's frontmatter: after changing those, run `npm run agents:update`, then `npm run agents:check`.

Each saved game records the hash of every prompt and the model it ran on. After changing `prompts/judge.md` or `JUDGE_MODEL`, run `npm run eval:judge` to check the judge still scores a fixed set of example answers in range.

```bash
npm run typecheck
npm run lint
npm test             # unit tests (vitest), no API calls
npm run test:live    # the fixed judge transcript against the real JUDGE_MODEL
npm run eval:judge   # judge regression set, add -- --runs 3 for medians
```

> [!TIP]
> To look around without any keys, run `npm run dev:mock`. The judge and debrief are canned, the characters speak with your browser's voice, and you type instead of talking.

> [!IMPORTANT]
> Browsers only allow the microphone over HTTPS or on localhost. Without `SUPABASE_SECRET_KEY`, live sessions are kept in memory, so run a single instance. With it, they live in the `game_sessions` table from [`supabase/schema.sql`](supabase/schema.sql): they survive restarts and deploys, and any number of instances works.

## Scope and limitations

- Delivery is judged from the transcript and timing, not from your actual voice, so tone and confidence only count through what you say and how fast.
- Without `SUPABASE_SECRET_KEY`, live sessions live in memory, so a server restart drops calls in progress, and finished games aren't saved to history.
- Anything that affects the score is decided on the server: the real profile is read from Supabase, the larp gap is signed by the server, and time runs on the server's clock from the moment the call connects. Only things only the browser can hear (when you start talking, silences) come from it.
- Group scenes are one agent playing several voices, so characters can occasionally talk over each other or take a beat to hand off.
- The judge is a language model. It can be wrong, and the scores are a game, not an assessment.
