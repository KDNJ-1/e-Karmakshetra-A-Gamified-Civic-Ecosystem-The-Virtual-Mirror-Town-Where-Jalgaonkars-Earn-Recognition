# e-Karmakshetra: Virtual Mirror Town (Prototype)

Prototype for **Hack for Social Cause 2027**, theme **Governance & Civic Technology**.
Verified residents file civic reports and proposals, peers verify them, officials sign off, and recognition points are
minted **only for verified outcomes**. The public map shows Prabhag-level pins; exact positions are for officials only.

> Upgrade of *Project Khandeshi Khichdi* (presented at Yuvolution 2026, team Positively Sociotropics).
> Every person, Prabhag name and coordinate in this repository is **fictional sample data**.

## What works
Game layer: neon arena look with Desi touches, bottom game bar, level and XP bar, badges, opt-in ward leaderboard, daily / monthly / yearly / festive quests (Quest XP), choice of profile picture (emoji badge, initials or your own photo), sound effects, confetti and level-up banners. All effects can be switched off.

Adults-only registration with pseudonyms · five roles and submission types · photo evidence · peer review (confirm or flag) ·
**10 peers + 1 official** verification gate · strike and revival buffer (4 chances) · dispute tribunal queue · Digital Saathi
assisted filing · append-only points ledger with daily cap and official offset corrections · audit trail · two-layer map ·
session limits and wellness prompts · official dashboard with KPIs.

## What is not built yet (roadmap; no agreements claimed)
Real identity (Meri Pehchaan, DigiLocker), real JCMC boundaries, ISRO or other government GIS, payments or cash conversion,
shopfronts, server database (reference schema in `db/schema.sql`). See `docs/DESIGN.md`.

## Quick start
1. Download or clone this repository.
2. In a terminal inside the folder run `python3 -m http.server 8000` (or `npm start`) and open <http://localhost:8000>.
   Opening `index.html` by double-click may fail because browsers block loading the sample data file.
3. Or publish it free with GitHub Pages: Settings, Pages, Branch `main`, folder `/ (root)`.

## Run the tests
Node.js 18+ (tested on Node 22): `npm test`. Expected: 34 tests pass.

## Environment variables
None are needed for the prototype. `.env.example` lists placeholders for the planned server version.

## Demo walk-through (5 minutes)
1. Choose **Official Demo (official)**, open **Official**: approve the report that is awaiting review. Peers who confirmed it are paid.
2. Choose **Asha-P4**, open **Ledger**: see +10 for her verified hazard report.
3. Choose **Dinesh-P1**, open **Review**: confirm a pending report (progress bar shows peers needed).
4. Open **File**: switch role, add a description and photo, submit. Then, as three different residents, **Flag** it
   to see a strike and the revision flow.
5. As the official, tick **Official layer** on **Map** to see exact positions; the public view shows Prabhag pins only.
6. In **Official**, set the threshold to 3 peers for a quick live demo (policy value is 10). Use **Reset demo** to restore.

## Game layer notes
- **Quest XP is recognition only.** It raises your level and badges. It never changes the points ledger and is never money.
- **Festive quests** are listed in `data/quests.json`. Dates for Navratri/Dussehra and Diwali 2026 follow the panchang; verify them before relying on them.
- **Profile photos** are shrunk and stay in your own browser in this prototype. The leaderboard is opt-in and shows pseudonyms, never locations.
- **Sound** uses short browser-generated tones (no audio files). Use the Sound and FX buttons to turn sound or effects off; "reduce motion" is respected.

## Project layout
```
index.html, style.css, app.js   interface (no framework, no build step)
src/core.js                     rules engine (verification, ledger, levels, badges, leaderboard, quests)
src/fx.js                       sound effects, confetti and banners (no libraries, no audio files)
data/quests.json                editable quest list (daily, monthly, yearly, festive)
data/sample_data.json           fictional demo data
tests/core.test.js              34 automated tests
docs/ARCHITECTURE.md            architecture diagrams (Mermaid)
docs/DESIGN.md                  technical design document and design refinements
db/schema.sql                   PostgreSQL / PostGIS reference schema (not run in the prototype)
prompts/                        AI prompts (disclosure)
.github/workflows/test.yml      runs the tests on every push
```

## Limitations (honest)
Data is stored in the browser (localStorage) and is per device. Photos are checked for presence, not uploaded. Identity
verification is simulated by an official clicking "Verify". The map is stylised and Prabhags are invented.

## AI disclosure

I come from a non-technical background and do not write code. This project is my idea, and I used AI tools (Claude and Gemini)
to turn it into working software.

**What is mine:** the concept of e-Karmakshetra, the basic workflow of the gamified civic app (how citizens report, verify and
earn recognition, and the five contributor roles), all raw thoughts, the limitations I wanted solved, and every decision about what
to keep, change or reject.

**What the AI did:** it wrote the source code and produced first drafts of the dossier, architecture and design documents. It also
critiqued my proposals and pointed out limitations. I mitigated each one (for example a staged rewards ladder instead of cash,
a two-layer map for location privacy, an adults-only pilot, and no claimed government agreements).

**How it was made:** the AI tools helped me build three demonstration repositories. I reviewed each, suggested changes and
corrections, and this repository is the final version of that process. I used AI as a tool to reach a better result, not as a
copy-and-paste shortcut.

**Estimated share of AI-generated content:** about [XX]% of the code and [XX]% of the written documents were drafted by AI;
the idea, workflow, rules, limitations and decisions are mine. [Author: state your honest figures before submission.]

A summary of how AI was used, stage by stage, is in the `prompts/` folder. The exact prompts are not published, to protect the author's personal information.

## Licence
MIT. See `LICENSE`.

## New in v7: the Virtual Mirror Town

Claim land on an empty plot grid, upgrade to a storefront, list products in a virtual mall, book the civic theatre, and watch officers handle reviews against a deadline. Two canvas views (2.5D isometric and flat 2D), three themes, Field / data-saver mode. Full rules, what is built and what is roadmap: [docs/TOWN.md](docs/TOWN.md). Points are in-game recognition and are never money.

## Optional: shared multi-person demo

The demo works on a single device by default. For a live multi-user town (many people, one shared state), follow [docs/SHARED_MODE.md](docs/SHARED_MODE.md). It is off by default, uses invented names only, and its rules are enforced client-side (pilot demo, not production security).
