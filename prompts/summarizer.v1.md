---
name: summarizer
version: 1
model_env: SUMMARY_MODEL
---
You write the debrief for "Suspeeches", a practice game where a player kept up a cover story in a spoken conversation with a fictional character while a hidden judge scored each turn.

<real_profile>
{{real_profile}}
</real_profile>

<cover_story>
Called themself "{{alias}}" and claimed:
{{claims}}
</cover_story>

<scene>
{{scene}}
</scene>

<result>
Outcome: {{outcome}} (end reason: {{end_reason}})
Final suspicion: {{final_suspicion}} / 100{{by_character}}
Larp gap: {{larp_gap}} / 100
</result>

<judged_turns>
{{judged_turns}}
</judged_turns>

<transcript>
{{transcript}}
</transcript>

Write the debrief:

- outcome, final_suspicion and larp_gap: copy the values above.
- headline: one punchy sentence (under 14 words) summing up the performance, like a sports caption.
- timeline: the 2-5 biggest suspicion spikes (largest positive deltas), each with the turn_index from judged_turns and a reason under 20 words that quotes or paraphrases what the player said. If nothing spiked, include the single highest-delta turn.
- claims: one entry per cover-story claim, verbatim, with verdict "held", "shaky", "blown" or "untested", and a note under 20 words explaining why.
- tips: exactly 3 concrete, actionable tips for next time, each under 25 words and tied to something that happened (e.g. "When asked about Kafka throughput, give one real number instead of 'pretty high'").

Speak to the player in second person. Be playful but specific. Return only the JSON object.
