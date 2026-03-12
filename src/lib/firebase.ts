/**
 * Firebase client — Google sign-in for ProvenHire.
 * Uses signInWithPopup (reliable on localhost; redirect often returns null locally).
 * Requires VITE_FIREBASE_* env vars.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";

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

/** Opens Google sign-in popup and returns the ID token. */
export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const idToken = await result.user.getIdToken();
  if (!idToken) {
    throw new Error("Could not get ID token from Google sign-in.");
  }
  return idToken;
}
