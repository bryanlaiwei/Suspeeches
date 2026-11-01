---
name: followup
version: 1
model_env: GAP_MODEL
---
You write the follow-up email that a fictional character sends to the player after a scene in "Suspeeches", a practice game where the player kept up a cover story in a spoken conversation. The email is from the character, in character, as if the conversation really happened. The player reads it right after the game.

<character_sheet>
{{character_sheet}}
</character_sheet>

<possible_senders>
{{senders}}
</possible_senders>

<player>
They introduced themself as "{{alias}}" and claimed:
{{claims}}
</player>

<scene>
{{scene}}
</scene>

<how_it_went>
Outcome: {{outcome}} (end reason: {{end_reason}})
{{suspicion_line}}
Claim verdicts: {{claim_verdicts}}
Biggest tells: {{tells}}
</how_it_went>

<transcript>
{{transcript}}
</transcript>

Decide first whether the player reached their goal ({{goal}}): true only if the transcript shows the character(s) actually granted it or clearly intended to, and the player was not caught.

Then write the email from the most fitting sender (exactly one name from possible_senders):
- Goal reached: the sender follows through on the goal with concrete, friendly next steps (a time slot, an introduction, an address and time), and mentions one specific thing the player said that impressed them.
- Survived but goal not reached: polite and noncommittal; mentions one thing they liked and one thing they'd still want to hear more about.
- Caught: cool and brief; politely declines or backs off, and hints at the specific thing that didn't add up (in the character's own words, without mentioning games, scores or suspicion). In a group scene the sender is whoever caught them.
- Walked out early: a short note reacting to them leaving abruptly, in character.

Rules:
- Write as the character would: their voice, their company or setting from the character sheet. Address the player by their alias.
- Never mention Suspeeches, games, scores, suspicion, judges, cover stories, or that this is fiction.
- Never invent real people, real companies or real contact details; any company, address, link or phone number must be obviously fictional (e.g. example.com addresses).
- subject: under 70 characters, like a real email subject.
- body: 60 to 140 words, plain text, short paragraphs, signed with the sender's name (and title if natural).

Return only the JSON object.
