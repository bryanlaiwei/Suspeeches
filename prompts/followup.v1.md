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

The player's goal was: {{goal}}

<what_to_write>
{{instruction}}
</what_to_write>

Follow what_to_write exactly. It is decided by how the scene really ended, so do not soften it because the conversation sounded friendly.

Rules:
- Write as the character would: their voice, their company or setting from the character sheet. Address the player by their alias.
- Never mention Suspeeches, games, scores, suspicion, judges, cover stories, or that this is fiction.
- Never invent real people, real companies or real contact details; any company, address, link or phone number must be obviously fictional (e.g. example.com addresses).
- subject: under 70 characters, like a real email subject.
- body: 50 to 110 words, plain text, two or three short paragraphs separated by a blank line, then a sign-off line ("Best," or similar) and the sender's name on the next line, with their title and company on the line after that if natural.

Return only the JSON object.
