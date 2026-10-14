# AI Use and Prompts (Full Disclosure)

This folder is the record of how AI tools were used to build this repository, as required by the Hack for Social Cause
guidelines. It is written in the author's own words and should be read together with the "AI Disclosure" section of the main `README.md`.

## Who did what

**The author (human) provided:**
- the idea of e-Karmakshetra, a virtual mirror town where citizens take part in civic life through a gamified, points-based system
- the basic workflow: how a citizen reports, how others verify, how recognition is earned, and the five contributor roles
- the raw thoughts and the limitations to be solved (addiction and time limits, fake accounts, digital literacy, map and data security, rewards law)
- every design decision, including accepting, rejecting or changing what the AI tools suggested
- the final selection of what goes into this repository

**The AI tools (Claude and Gemini) provided:**
- the source code, because the author is from a non-technical background and has no coding experience
- first drafts of the project dossier, architecture and design documents, which the author then reviewed and changed
- critique: they pointed out limitations in the author's proposals, and the author decided how to mitigate each one

## How the work went (iteration, not copy and paste)

1. The author wrote the idea and raw thoughts and gave them to the AI tools.
2. The AI tools built **three demonstration repositories**. None of them was accepted as it came.
3. After each one the author reviewed the behaviour against the intended workflow and suggested changes: stricter verification, privacy of exact locations, protection against fake accounts and gaming, limits on use, and inclusion of people who cannot use a smartphone.
4. The AI tools also pointed out weaknesses in the author's own proposals (for example cash conversion of points, fictional shops, use of government platforms without agreements, the use of identity numbers, and minors' data). The author mitigated these: a staged value ladder instead of cash, no claimed government agreements, a two-layer map, an adults-only pilot, and an identity token instead of an identity number.
5. The author's own architecture document was used as the reference for the final version, and the repository was rebuilt around it.
6. The final repository is the result of that review cycle.

**Principle:** AI was used as a tool to reach a better result, not as a replacement for the author's thinking and not as a copy-and-paste shortcut.

## Prompt record (summarised)

The exact messages exchanged with the AI tools are **not published in this repository**. They contain the author's personal
working notes and conversation context, and publishing them could expose personal information. Instead, each stage is
summarised below, and the author can describe or demonstrate any stage on request.

| Stage | Purpose of the prompt | Tool |
| --- | --- | --- |
| 1 | Describe the idea, roles and workflow; ask for a first working prototype | Claude / Gemini |
| 2 | Rules engine for peer-verified civic submissions, append-only points ledger, flag/strike/revival logic and a two-layer map | Claude / Gemini |
| 3 | Mobile-friendly single-page interface with an SVG Prabhag map and role switching | Claude / Gemini |
| 4 | Automated tests using Node's built-in test runner | Claude |
| 5 | Ask the AI to critique the proposal; the limitations it raised and the author's mitigations | Claude / Gemini |
| 6 | Architecture and design documents and the PostgreSQL/PostGIS reference schema, reviewed against the author's own architecture draft | Claude |
| 7 | Game-style interface (neon arena with Desi touches), levels, badges, leaderboard, quests, profile pictures, sound and screen effects, based on the author's design choices | Claude |

## Responsibility
The author takes responsibility for the contents of this repository, including its limitations as stated in `README.md` and
`docs/DESIGN.md`. All people, places and data in the sample data are fictional.
