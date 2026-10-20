/* Shared (multi-person) mode is OFF by default. The demo then runs on one device only.
   To turn it ON, create a free Firebase project, enable Anonymous sign-in and a Realtime Database,
   then replace `null` below with your config object. See docs/SHARED_MODE.md for the steps.
   Note: a Firebase web config is not a secret; access is controlled by the database rules. */
window.EK_FIREBASE_CONFIG = null;
/* Example (do not use these values):
window.EK_FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  room: "demo"
};
*/
