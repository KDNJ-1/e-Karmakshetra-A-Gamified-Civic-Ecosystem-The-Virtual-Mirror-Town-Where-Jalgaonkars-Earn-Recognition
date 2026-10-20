# Shared (multi-person) demo mode — optional

By default the demo runs **on one device**: each visitor has a private copy of the sample town saved in their own browser. That is safe and needs no server, but visitors cannot see each other.

Shared mode lets many people use **one live town at the same time** (one person files, another confirms, an "official" verifies, everyone sees the same leaderboard). It uses Google's free Firebase Realtime Database. It is **off unless you paste a config** into `firebase-config.js`. If anything fails, the app falls back to the single-device demo automatically.

## Setup (about 10 minutes, free, no credit card)

1. Go to https://console.firebase.google.com and sign in with a Google account. Click **Create a project** (any name, e.g. `ekarma-demo`). Disable Google Analytics.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
3. **Build → Realtime Database → Create database.** Pick a region, choose **Start in locked mode**. Copy the database URL shown (looks like `https://ekarma-demo-default-rtdb.firebaseio.com`).
4. In the database, open the **Rules** tab, replace everything with the text below, then **Publish**:
   ```json
   {"rules":{"rooms":{"$room":{".read":"auth != null",".write":"auth != null"}}}}
   ```
5. **Project settings (gear icon) → General → Your apps → Web (`</>`) → register an app** (no hosting). Copy the `firebaseConfig` values.
6. On GitHub open `firebase-config.js`, replace `window.EK_FIREBASE_CONFIG = null;` with:
   ```js
   window.EK_FIREBASE_CONFIG = {
     apiKey: "…", authDomain: "…", databaseURL: "https://…firebaseio.com",
     projectId: "…", room: "demo"
   };
   ```
   Commit. Wait ~1 minute for GitHub Pages.
7. **Test with two phones** (or one phone + one laptop): register different invented names, switch one to *Official Demo*, verify the other. You should see changes on both screens within a second or two. The note under the header says "Shared demo connected".

To switch it off again, put the file back to `window.EK_FIREBASE_CONFIG = null;`.

## Honest limits (say these to judges)

- The Firebase web config is **not a secret**; that is normal for web apps. But with the rules above, **anyone who has the link can read and write the demo room.** Treat it as a public sandbox: **use invented names only; never enter real personal data.**
- Rules (10 peers + official, daily caps, strikes) are enforced **in the browser code**, not by a hardened server. This is a pilot demo, not production security; the production design (server-side enforcement, PostgreSQL/PostGIS) is described in `docs/ARCHITECTURE.md`.
- The **Reset demo** button resets the town for **everyone**. A visitor can also vandalise it. Keep a note to reset before a live presentation.
- Concurrent actions use database transactions, so two people acting at once do not overwrite each other.
- This mode was tested with a simulated Firebase across two browser tabs, not against a live Firebase project by the author's tooling. Test it with real devices before relying on it.
- Free Spark tier limits (about 1 GB stored, 100 simultaneous connections) are ample for a survey demo.
