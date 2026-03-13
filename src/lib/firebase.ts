/**
 * Firebase client — Google sign-in for ProvenHire.
 * Uses signInWithPopup to avoid firebaseapp.com/__/firebase/init.json 404 errors
 * (which occur when using signInWithRedirect without Firebase Hosting deployed).
 * Requires VITE_FIREBASE_* env vars.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithPopup, getRedirectResult, GoogleAuthProvider } from "firebase/auth";

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

/** User-friendly messages for Firebase auth error codes. */
function firebaseAuthErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    "auth/popup-closed-by-user": "Sign-in was cancelled. Please try again.",
    "auth/cancelled-popup-request": "Sign-in was cancelled. Please try again.",
    "auth/popup-blocked": "Pop-up was blocked. Allow pop-ups for this site and try again.",
    "auth/account-exists-with-different-credential": "An account already exists with this email. Sign in with your existing method.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/invalid-credential": "Invalid or expired sign-in. Please try again.",
    "auth/user-disabled": "This account has been disabled.",
  };
  return messages[code] || "Google sign-in failed. Please try again.";
}

/** Google sign-in via popup. Returns id token on success. Avoids firebaseapp.com redirect/init.json 404. */
export async function signInWithGooglePopup(): Promise<string> {
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const token = await result.user.getIdToken();
    if (!token) throw new Error("Failed to get Google ID token");
    return token;
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
    if (typeof code === "string" && code.startsWith("auth/")) {
      throw new Error(firebaseAuthErrorMessage(code));
    }
    throw err;
  }
}

/** Call on app load after returning from Google OAuth redirect (legacy). Returns id token if user just signed in, else null. */
export async function getGoogleRedirectIdToken(): Promise<string | null> {
  const auth = getAuth(getFirebaseApp());
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  const idToken = await result.user.getIdToken();
  return idToken || null;
}
