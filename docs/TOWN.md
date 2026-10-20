# The Virtual Mirror Town (v7)

A playable layer on top of the civic engine. Points still come only from verified civic work; the town is where residents *spend and show* them.

## Built and tested in this version (`src/town.js`, 17 automated tests)

| Feature | Rule implemented |
|---|---|
| Land | Empty plots per Prabhag (4 columns, 3 rows to start). A new row appears when 75% of plots are claimed. Starter plot / Hall of Fame = 51 points, one plot per resident, own Prabhag only. |
| Upgrades | Storefront = 151 points and needs a Verified Citizen Maker badge (an official checks a photo ID). Each further upgrade = 51 points, up to level 5 (Emporium). |
| Storefronts | Name, description, template, accent colour, optional https link. Text screening (illegal ads, political campaigning, `<` `>`), 1-point registration fee, officer review within 4 days. |
| Officer SLA | Warning at 75% of the window. The admin may then step in; every idle reviewer loses 1 point. A wrongly rejected shop that is overturned on appeal costs the reviewer 15 points. Reviewers cannot review their own shop. |
| Tax | 2 points/month per plot, +2 with an approved shop. 2 months grace, then the plot shows CLOSED for 5 months, then it is demolished and the cell is free. Arrears can be cleared at any time before demolition. |
| Where points go | Lease and tax: 50% ward quest-bounty pool, 30% festive-gift pool, 20% to the ward's Design Engineers (ward pool if none). Review fees go to the reviewer. Every movement is double-entry in the append-only ledger. |
| Roles | Design Engineer, Officer, Theatre Manager: admin approval, 21-point fee (refunded if rejected). |
| Mall | Approved shops only, with public complaint flow: buyer reports, seller and ward officer see it, after 7 days it becomes public and the Maker badge freezes; an upheld complaint costs one of the shop's 4 revival chances. |
| Rangamanch (stage) | Proposal fee 1 point, 24-hour manager review, 5-90 minutes, no two shows by one person within 24 hours, no overlapping slots. Seats 2 points to the performer (performer can change the price), 1-point claps, optional replay price, balcony = free short clips. Streams are linked or embedded, never served by us. |
| Safe chat | Pre-set phrases in English and Hindi, 6-second bubbles, 10 per minute. |
| Views | 2.5D isometric and flat 2D canvas, with walking avatars (ghost mode: they pass through each other), 3 colour themes, retro chimes / organic ambient / silent. |
| Field mode | Manual button plus auto-detect (Save-Data, 2G/3G, 2 GB RAM or less): no canvas, no animation, no decorative layers, plain tables. |

XP is computed from points *earned* (not the wallet), so spending never lowers a level.

## Deliberately not built yet (roadmap, with reasons)

- **Money, UPI, cash-out.** The app never touches rupees. Buying goes to the seller's own website. Real-money gaming and prepaid-instrument rules are strict in India; legal advice is needed before any conversion of points to money.
- **Live multi-user MMORPG.** Optional shared mode exists (`docs/SHARED_MODE.md`); a real-time presence server (avatars seen live by all) is the next step.
- **Low-poly 3D, WebRTC audio rooms, free-text private chat, offline photo queue, delivery tracking with OTP, server-side rules, k-anonymity map, Redis/Postgres ledger.** Designed in `docs/ARCHITECTURE.md`; the browser-only demo cannot honestly prove them.
- **Real brand revenue share.** A business plan item, not software.

## Honest limits

Rules run in the browser; the demo clock and demo grants exist only so judges can try the economy in minutes. All people and shops are fictional samples.
