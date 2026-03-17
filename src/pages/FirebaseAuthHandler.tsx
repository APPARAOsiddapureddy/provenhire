/**
 * Shown when user returns from Google OAuth redirect at /__/auth/handler.
 * AuthContext bootstrap runs getGoogleRedirectIdToken() and then navigates away.
 */
const FirebaseAuthHandler = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
    <div
      className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin"
      style={{ animationDuration: "0.6s" }}
      aria-hidden
    />
    <p className="text-muted-foreground">Signing you in…</p>
  </div>
);

export default FirebaseAuthHandler;
