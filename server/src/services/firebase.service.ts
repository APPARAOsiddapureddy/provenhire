/**
 * Firebase Admin SDK — verify Google ID tokens and extract user info.
 * Prefer: firebase-service-account.json in server dir, or GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_* env vars.
 */
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let firebaseInitialized = false;

export function initFirebase(): void {
  if (firebaseInitialized) return;
  if (admin.apps.length > 0) {
    firebaseInitialized = true;
    return;
  }
  const serviceAccountPath = path.join(__dirname, "../../firebase-service-account.json");
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const jsonPath = credsPath && fs.existsSync(credsPath) ? credsPath : (fs.existsSync(serviceAccountPath) ? serviceAccountPath : null);
  if (jsonPath) {
    const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    return;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    const parsedKey = privateKey.replace(/\\n/g, "\n");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: parsedKey,
      }),
    });
    firebaseInitialized = true;
  }
}

export interface FirebaseDecodedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseDecodedToken> {
  initFirebase();
  if (!admin.apps.length) {
    throw new Error("Firebase is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS.");
  }
  const decoded = await admin.auth().verifyIdToken(idToken);
  return {
    uid: decoded.uid,
    email: decoded.email ?? undefined,
    name: (decoded.name as string) ?? undefined,
    picture: (decoded.picture as string) ?? undefined,
  };
}
