# Google Authentication Setup (Firebase)

ProvenHire supports **Sign in with Google** using Firebase Authentication. Follow these steps to enable it.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Authentication** → **Sign-in method** → **Google**
4. Add your domain(s) to **Authorized domains** (e.g. `localhost`, `yourdomain.com`)

## 2. Get Web App Credentials

1. In Firebase Console: **Project Settings** → **General** → **Your apps**
2. Add a **Web app** (</> icon)
3. Copy the `firebaseConfig` values

## 3. Frontend Configuration

Add these to your `.env` (or `.env.local`):

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 4. Backend Configuration (Firebase Admin)

You need a **Service Account** to verify tokens on the backend.

### Option A: JSON file (recommended for local dev)

1. Firebase Console → **Project Settings** → **Service accounts**
2. Generate new private key (download JSON)
3. Save as `server/firebase-service-account.json` (gitignored), or set:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
   ```

### Option B: Environment variables (for Render, Vercel, etc.)

Extract from the service account JSON:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

Note: `FIREBASE_PRIVATE_KEY` must include `\n` for newlines (or use actual newlines in a multi-line secret).

## 5. Authorized Domains

In Firebase Console → **Authentication** → **Settings** → **Authorized domains**, add:
- `localhost` (for development)
- Your production domain (e.g. `yourapp.com`)

## 6. Verify Setup

- **Frontend**: "Continue with Google" button appears on Login and Signup pages
- **Flow**: Clicking redirects to Google → user signs in → redirects back → token sent to `POST /api/auth/google` and verified

## Auth Flow (Popup)

1. User clicks "Continue with Google"
2. Popup opens → user signs in with Google
3. Frontend gets ID token → sends to backend
4. Backend verifies token with Firebase Admin SDK
5. User is created (if new) or logged in → JWT returned
6. User redirected to dashboard

**Note:** `signInWithRedirect` often returns null on localhost due to browser storage restrictions. We use `signInWithPopup` for reliable local development.

## Security

- **Always verify tokens on the backend** — never trust frontend-only auth
- Firebase Admin SDK validates token signature and expiry
- Blocked emails are still enforced
