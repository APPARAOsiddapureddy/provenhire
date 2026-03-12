/**
 * Firebase client — Google sign-in for ProvenHire.
 * Uses signInWithRedirect (avoids COOP/popup issues in production; no window.closed blocking).
 * Requires VITE_FIREBASE_* env vars.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0] as FirebaseApp;
    } else {
      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        throw new Error("Firebase is not configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID to .env");
      }
      app = initializeApp(firebaseConfig);
    }
  }
  return app;
}

export function isFirebaseConfigured(): boolean {
  return !!(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);
}

/** Initiates Google sign-in via redirect. Page will navigate away; result handled by getGoogleRedirectIdToken. */
export async function signInWithGoogleRedirect(): Promise<void> {
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
}

/** Call on app load after returning from Google OAuth. Returns id token if user just signed in via redirect, else null. */
export async function getGoogleRedirectIdToken(): Promise<string | null> {
  const auth = getAuth(getFirebaseApp());
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  const idToken = await result.user.getIdToken();
  return idToken || null;
}
