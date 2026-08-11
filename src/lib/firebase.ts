import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

/**
 * Firebase client singletons.
 *
 * Everything is created lazily. Next.js renders client components on the server
 * during the initial pass, and the offline cache below needs IndexedDB, so
 * initialisation has to be deferred until something actually asks for it in the
 * browser.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const usingEmulator =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const emulatorHost = process.env.NEXT_PUBLIC_EMULATOR_HOST || "localhost";
const authEmulatorPort = Number(
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || 9099,
);
const firestoreEmulatorPort = Number(
  process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080,
);

/** Missing config is a deployment mistake; fail loudly rather than at first query. */
function assertConfigured() {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Firebase config is incomplete (missing: ${missing.join(", ")}). ` +
        "Copy .env.example to .env.local and fill in the values, or run " +
        "`make dev` to use the emulator.",
    );
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();
  assertConfigured();
  return initializeApp(firebaseConfig);
}

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;

  authInstance = getAuth(getFirebaseApp());

  if (usingEmulator) {
    // `disableWarnings` silences the banner the SDK prints on every reload;
    // the app already shows its own "local emulator" indicator.
    connectAuthEmulator(
      authInstance,
      `http://${emulatorHost}:${authEmulatorPort}`,
      { disableWarnings: true },
    );
  }

  return authInstance;
}

let dbInstance: Firestore | null = null;

export function getDb(): Firestore {
  if (dbInstance) return dbInstance;

  const app = getFirebaseApp();

  if (typeof window === "undefined") {
    // Server render: no IndexedDB, and nothing should be querying anyway.
    dbInstance = getFirestore(app);
    return dbInstance;
  }

  // Persistent cache is what makes the PWA usable on a gym's dead wifi: reads
  // are served locally and writes queue until the connection returns.
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });

  if (usingEmulator) {
    connectFirestoreEmulator(dbInstance, emulatorHost, firestoreEmulatorPort);
  }

  return dbInstance;
}

// --- Auth providers ------------------------------------------------------

export function googleProvider() {
  const provider = new GoogleAuthProvider();
  // Always show the chooser: athletes often have a personal and a coach account.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export function appleProvider() {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return provider;
}
