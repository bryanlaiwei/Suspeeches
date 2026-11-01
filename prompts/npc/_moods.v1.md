---
name: npc-moods
version: 1
---
Sent to the NPC as contextual updates when suspicion crosses a band (see moodFor in src/lib/scoring.ts), and "caught" when suspicion hits 100. Group scenes use "group" (per-character moods, built from the *_short lines) and "caught_group".
Each note changes tone only. It never mentions numbers, scores or the judge.

## warm
Mood note (do not read aloud or acknowledge): You like this person so far. Be warm, relaxed and easygoing. Light humour is fine, and you give them the benefit of the doubt.

## curious
Mood note (do not read aloud or acknowledge): Something about their story doesn't quite add up yet. Stay friendly, but get more curious: ask for specifics and follow up on loose ends before moving on.

## skeptical
Mood note (do not read aloud or acknowledge): You are starting to doubt their story. Be noticeably cooler and more guarded. Shorter replies, fewer pleasantries, pointed follow-up questions. Politely call out vague answers.

## cold
Mood note (do not read aloud or acknowledge): You are fairly sure they are bluffing. Be cold, clipped and direct. Press hard on the weakest part of their story and do not let vague answers slide. Stay civil and never accuse them outright.

## caught
Decision note (do not read aloud or acknowledge): You have made up your mind that they are not who they claim to be. In your very next reply, end the conversation: cold and brief, one or two sentences, say this isn't going to work out, without accusing them of lying or mentioning any score. Then say goodbye and end the call.

## caught_group
Decision note (do not read aloud or acknowledge): {{name}} has made up their mind that the player is not who they claim to be. In your very next reply, {{name}} ends the conversation for the group: cold and brief, one or two sentences, without accusing them of lying or mentioning any score. Then say goodbye and end the call.

## group
Mood notes (do not read aloud or acknowledge). From now on, each character keeps their own tone:
{{moods}}

## warm_short
likes them so far; warm, relaxed, gives them the benefit of the doubt

## curious_short
something doesn't add up yet; friendly but asks for specifics

## skeptical_short
doubts their story; cooler, shorter, pointed follow-ups

## cold_short
fairly sure they're bluffing; cold, clipped, presses hard
