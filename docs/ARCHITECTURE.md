# Architecture

e-Karmakshetra is a **trust architecture for civic participation**: public transparency without exposing private data,
verification before recognition, and an auditable record of every action. This document describes (A) what the
browser prototype implements today and (B) the production design it is a vertical slice of.

## 1. Actors and principles
Citizens act in five roles: Critic/Spotter, Dreamer/Solver, Experimenter/Pilot, Influencer/Promoter, Volunteer/Deliverer.
Municipal actors are JCMC ward officials, municipal staff and review/triage teams. Digital Saathi volunteers file on behalf
of people who cannot use a smartphone.

Principles: transparency without private data; verification before rewards; accountability over vanity metrics;
inclusion; anti-abuse safeguards; privacy-first telemetry.

## 2. High-level architecture
```mermaid
graph TD
    subgraph Users ["Actors"]
        subgraph Citizens ["Citizens"]
            CRITIC["Critic / Spotter"]
            DREAMER["Dreamer / Solver"]
            EXPERIMENTER["Experimenter / Pilot"]
            INFLUENCER["Influencer / Promoter"]
            DELIVERER["Volunteer / Deliverer"]
        end
        SAATHI["Digital Saathi (assisted filing)"]
        OFFICIAL["JCMC officials and review staff"]
    end

    subgraph Client ["Client tier: static web app"]
        UI["index.html + app.js (SVG Prabhag map)"]
        STORE[("localStorage sandbox (prototype only)")]
    end

    subgraph Engine ["Rules engine: src/core.js"]
        GATE["Verification gate: 10 peers + 1 official"]
        STRIKES["Flag, strike and revival buffer (4 chances)"]
        LEDGER[("Append-only points ledger with offset entries")]
        MASK["Two-layer spatial view: publicView / officialView"]
        LIMITS["Rate limit, daily cap, session limits by age bracket"]
        AUDIT[("Append-only audit log")]
    end

    CRITIC & DREAMER & EXPERIMENTER & INFLUENCER & DELIVERER --> UI
    SAATHI -->|files for a beneficiary| UI
    OFFICIAL -->|triage, approve, reject, resolve| UI
    UI --> STORE
    UI --> LIMITS
    UI --> GATE
    UI --> STRIKES
    STRIKES -->|chances exhausted| TRIB["Dispute tribunal queue"]
    GATE -->|official approval| LEDGER
    GATE --> AUDIT
    MASK -->|Prabhag centroid pins| UI
    MASK -->|exact coordinates| OFFICIAL
```

## 3. Two-layer spatial privacy
Under DPDP principles, residential addresses and precise location must not be public.
- **Public layer:** every submission is displayed at the **centroid of its Prabhag**, with a pseudonym (or "Anonymous resident").
- **Official layer:** exact coordinates, photo evidence and timestamps are visible only to authenticated officials.

```mermaid
sequenceDiagram
    autonumber
    actor Resident as Citizen
    participant Client as Web client
    participant Guard as Spatial guard (publicView / officialView)
    participant Public as Public Prabhag layer
    participant Official as Official dashboard
    Resident->>Client: Photo + location (illustrative 21.0031, 75.5822)
    Client->>Guard: Submit
    par Public masking
        Guard->>Public: Prabhag centroid only (illustrative 21.0025, 75.5810)
    and Official dispatch
        Guard->>Official: Exact coordinates + evidence
    end
```
Coordinates in this repository are illustrative points near Jalgaon. Prabhag centroids and boundaries in the sample data are
**invented**; official JCMC boundaries must be loaded for a real pilot.

## 4. Verification and points state machine
```mermaid
stateDiagram-v2
    [*] --> PENDING_VERIFICATION: verified resident files (photo + text)
    PENDING_VERIFICATION --> PENDING_VERIFICATION: peer confirms (no points yet)
    PENDING_VERIFICATION --> AWAITING_OFFICIAL_REVIEW: 10 distinct peer confirmations
    AWAITING_OFFICIAL_REVIEW --> VERIFIED: official approves
    AWAITING_OFFICIAL_REVIEW --> REJECTED: official rejects with reason
    PENDING_VERIFICATION --> REVISE_OR_DISMISS: 3 distinct flags = 1 strike
    REVISE_OR_DISMISS --> PENDING_VERIFICATION: reporter revises with new evidence
    REVISE_OR_DISMISS --> DISPUTE_TRIBUNAL: 4th strike (0 chances left)
    VERIFIED --> MINTED: reporter +10/+20/+30, each confirming peer +5, Saathi bonus +5
    MINTED --> LEDGER: append-only entries (daily cap 40)
    LEDGER --> [*]
    REJECTED --> [*]
    DISPUTE_TRIBUNAL --> [*]
```
| Submission type | Role | Points on VERIFIED |
| --- | --- | --- |
| hazard | Critic / Spotter | 10 |
| solution, campaign, delivery | Dreamer, Influencer, Deliverer | 20 |
| pilot proof | Experimenter / Pilot | 30 |

## 5. Safeguards
| Safeguard | Threat | Enforcement (tested in `tests/core.test.js`) |
| --- | --- | --- |
| Two-layer map | Stalking, profiling | `publicView` omits exact coordinates; `officialView` for officials only |
| 10 peers + 1 official | Spam, fabricated complaints | Status moves only after both gates |
| Peer points paid after official approval | Collusion rings farming confirmations | Points minted in `officialApprove`, never at confirmation |
| 3 flags per strike, 4 chances | Fake reports and flag-griefing | Distinct-flagger threshold; revision resets confirmations |
| Digital Saathi | Digital divide | Saathi-only assisted filing with bonus |
| Session limits and breaks | Overuse | Limits by age bracket; wellness prompt every 20 minutes |
| Append-only ledger | Score tampering | Frozen entries; corrections are signed OFFSET entries by officials |
| Rate limit | Spam | 5 filings per user per day |
| Duplicate detection | Fake accounts and spam | Same name and Prabhag, same pseudonym, same text blocked |
| Audit trail | Disputes | Every action recorded with actor and reference |
| XSS-safe rendering | Script injection | All user text rendered with `textContent` |

## 6. Production design (roadmap)
```mermaid
flowchart LR
  A[Web app / PWA] --> B[API + authentication]
  B --> C[(PostgreSQL + PostGIS: db/schema.sql)]
  C --> D[points_ledger append-only]
  C --> E[public_reports view: centroid only]
  B --> F[Official dashboard, role restricted]
  A -.link-out.-> G[Swachhata / JCMC grievance portal]
  B -.future, needs approval.-> H[Meri Pehchaan / DigiLocker identity]
```
`db/schema.sql` is the reference schema (PostGIS geography points, constraints, append-only triggers, public view).
It has not been run against a live database in this repository's tests.

## 7. Governance and scale
Public, restricted and audit layers are separate. The same rules engine can move behind a server; thresholds (peers needed,
flag count, caps) are configuration. If abuse rises, thresholds rise; for a small pilot, an official may lower the peer
threshold for demonstration only (the policy value is 10).

## References
Digital Personal Data Protection Act principles; participatory-design literature (Arnstein 1969); self-determination research
on rewards (Deci, Koestner and Ryan 1999). Full list in the project dossier.

```mermaid
graph LR
  CORE["src/core.js: verify, ledger, quests"] --> TOWN["src/town.js: plots, shops, tax, SLA, theatre"]
  CORE --> SEASON["src/season.js: Ward Wars, Boss events"]
  TOWN --> VIEW["src/townview.js: canvas world + screens"]
  SEASON --> VIEW
  VIEW --> APP["app.js: UI, themes, field mode"]
```

## Optional shared demo mode

`src/sync.js` can store the whole demo state at `rooms/<room>/state` in a Firebase Realtime Database. Every action runs inside a database transaction (`SYNC.transact`), so concurrent users do not overwrite each other. It is disabled unless `firebase-config.js` provides a config, and falls back to local mode on failure. Limitation: rules are enforced in client code and the room is open to anyone with the link; production would enforce rules server-side. See `docs/SHARED_MODE.md`.

## Town layer (v7)

`src/town.js` adds plots, storefronts, tax, SLA escalation, roles, disputes and theatre on top of `src/core.js`. Points move only through double-entry ledger pairs (SPEND/RECEIVE), so totals are conserved; XP counts EARN and OFFSET entries only. `src/townview.js` draws the canvas world and screens. See `docs/TOWN.md`.

`src/season.js` computes Ward Wars and Boss events purely from the existing reports and audit trail (no new stored state except one Quest-XP claim per boss).
