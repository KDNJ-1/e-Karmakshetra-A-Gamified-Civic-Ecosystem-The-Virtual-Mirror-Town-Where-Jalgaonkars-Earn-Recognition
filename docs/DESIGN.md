# Technical Design Document

## 1. Problem and scope
Citizens can complain through existing portals but rarely see closure, cannot propose or pilot solutions, and receive no
recognition. The prototype demonstrates a minimum, safe loop: **file with evidence, peer-verify, official-approve, record
recognition points**, with a privacy-preserving public map.

## 2. What the prototype implements
- Registration (adults only), pseudonyms, duplicate-account detection, identity verification by an official
- Five roles mapped to five submission types; role-matched filing
- Photo-evidence requirement; duplicate-report blocking; 5 filings per day
- Peer review: confirm or flag; **10 peers** needed (official can lower it for a live demo only)
- Official review: approve, reject with reason, mark resolved, verify identities, correct the ledger with offset entries
- Flag, strike and revival: 3 distinct flags cost 1 of 4 chances; reporter revises; chances exhausted go to a tribunal queue
- Digital Saathi assisted filing with a bonus
- Append-only ledger, daily cap, audit trail
- Two-layer map (Prabhag centroids vs exact positions)
- Session limits by age bracket and 20-minute wellness prompts

## 2b. Game layer (recognition, not money)
- **Levels:** Seed, Sprout, Sapling, Tree, Grove, Forest, computed from XP = ledger points + Quest XP.
- **Quests:** daily, monthly, yearly and festive or special-event quests read from `data/quests.json`. Rewards are **Quest XP only**: they raise levels and badges but never enter the points ledger and never become money. Quests are claimable once per period.
- **Badges:** computed from verified outcomes (First Light, Peer Guardian, Digital Saathi, Pilot Pioneer, Quest Hunter, Festival Spirit).
- **Leaderboard:** opt-in, requires a public profile, shows pseudonym, level and XP only.
- **No streak penalties, no random rewards, no countdown pressure.** Session limits and break prompts remain.
- **Profile pictures:** emoji badge, initials, or an uploaded photo shrunk to 96 px and stored in the browser only (limit 80 KB).
- **Effects and sound:** generated in the browser, switchable, and disabled automatically when the device asks for reduced motion.
- **Festive dates:** Navratri to Dussehra 12 to 21 Oct 2026 and Diwali 8 Nov 2026 are from public calendars and follow the panchang; they are indicative.

## 3. Design refinements made to the first architecture draft
| Draft | Refinement | Why |
| --- | --- | --- |
| Peers earn +5 on each confirmation | Peers earn +5 **only when an official verifies** | Prevents collusion rings farming points on fake reports |
| One flag could trigger a strike | **3 distinct flags** per strike | Prevents a single troll from griefing honest reporters |
| `gov_id_hash` | `identity_ref_hash` (salted hash of an identity-provider token) | Storing or hashing Aadhaar numbers is restricted for private entities |
| Age brackets `11-18`, `18-35`, `35-60` overlap | `0-10`, `11-17`, `18-35`, `36-59`, `60+` | Unambiguous bracket for each age |
| Brackets include minors | Pilot is **18+**; minors need verified parental consent (DPDP) | Child data rules; roadmap item |
| `points_awarded >= 0` but corrections needed | Ledger has `EARN` and `OFFSET` rows with signed deltas | Corrections without editing history |
| Four statuses | Added `REJECTED` and `DISPUTE_TRIBUNAL` | The state diagram already contained both |
| Ledger "append-only" by convention | SQL triggers block UPDATE and DELETE | Enforced, not promised |
| `peer_confirmations` default 1 | Default 0 | The reporter's own report is not a confirmation |
| Revision after a strike | Revision resets confirmations | Peers confirmed the old content |

## 4. Rules (constants in `RULES`, `src/core.js`)
Peers needed 10 · flags per strike 3 · revival chances 4 · points hazard 10, solution/campaign/delivery 20, pilot 30 ·
peer 5 · Saathi bonus 5 · daily cap 40 · filings per day 5 · session 60 min (45 for 60+) · break every 20 min.
All values are design choices to be tuned in the pilot.

## 5. Testing
34 automated tests (`npm test`) cover: adult gate, bracket boundaries, duplicates, role-matched filing, rate limit, the
10-peer threshold, self/double review, no points before approval, approval minting, kind-based points, rejection,
official-only actions, flag strikes, revision, four strikes to tribunal, Saathi filing, daily cap, frozen ledger and offsets,
public vs official map views, anonymous profiles, session limits, audit trail, threshold control and KPIs, plus levels, profile pictures, opt-in leaderboard, badges and quests (periods, windows, claim once, XP never touches the ledger).

## 6. Value ladder (policy, not code)
Recognition and certificates, then local vouchers, then sponsor-paid honoraria, then wider redemption only after legal review.
The prototype issues points only; no money or vouchers.

## 7. Known limitations
Data lives in the browser; identity verification is simulated; photos are checked for presence and not uploaded;
the map is stylised and the Prabhags are fictional; the database schema is a reference design.

## 8. Roadmap
Server and database from `db/schema.sql`; Meri Pehchaan / DigiLocker identity; official JCMC boundaries; link-outs to
Swachhata and the JCMC grievance portal; Marathi and Hindi interface; accessibility audit; pilot in two or three Prabhags with
Digital Saathi volunteers. No government agreement is claimed.
