/**
 * Firebase client — Google sign-in for ProvenHire.
 * Requires VITE_FIREBASE_* env vars.
 * In production we use the app's own domain as authDomain so redirect returns to our site
 * and we avoid firebaseapp.com/__/firebase/init.json 404 (app is not deployed on Firebase Hosting).
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from "firebase/auth";

function getFirebaseConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  // Prefer explicit auth domain from env (classic *.firebaseapp.com — matches older working setups).
  // If unset in production, use the current host so OAuth redirect can return to this origin (Firebase Console must list this domain).
  const authDomain =
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) ||
    (typeof window !== "undefined" && import.meta.env.PROD && window.location?.host
      ? window.location.host
      : `${import.meta.env.VITE_FIREBASE_PROJECT_ID || "provenhire-c153e"}.firebaseapp.com`);
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

let app: FirebaseApp | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0] as FirebaseApp;
    } else {
      const config = getFirebaseConfig();
      if (!config.apiKey || !config.projectId) {
        throw new Error("Firebase is not configured. Add VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID to .env");
      }
      app = initializeApp(config);
    }
  }
  return app;
}

export function isFirebaseConfigured(): boolean {
  return !!(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);
}

/**
 * Full-page redirect avoids popup + window.close(), which some browsers block when COOP is strict.
 * Set VITE_GOOGLE_USE_REDIRECT=false to force popup even in production (e.g. debugging).
 */
export function preferGoogleRedirectSignIn(): boolean {
  const v = import.meta.env.VITE_GOOGLE_USE_REDIRECT;
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return import.meta.env.PROD;
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

/** Google sign-in via popup. Returns id token on success. */
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

/**
 * Google sign-in via full-page redirect. Avoids COOP/popup issues in production.
 * Call this when user clicks "Sign in with Google"; the page will redirect to Google and back.
 * On return, bootstrap runs getGoogleRedirectIdToken() and completes the flow.
 */
export async function signInWithGoogleRedirect(): Promise<void> {
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
}

/** Call on app load after returning from Google OAuth redirect (legacy). Returns id token if user just signed in, else null. */
export async function getGoogleRedirectIdToken(): Promise<string | null> {
  const auth = getAuth(getFirebaseApp());
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  const idToken = await result.user.getIdToken();
  return idToken || null;
}
