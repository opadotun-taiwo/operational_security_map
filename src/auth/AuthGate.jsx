import React, { useEffect, useState } from 'react';
import { Activity, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabase';
import { isOafEmail, signInWithGoogle, signOut, OAF_DOMAIN } from './oafAuth';

/**
 * Shows the app only to signed-in One Acre Fund staff. Everyone else sees the sign-in
 * screen; a non-OAF account is signed straight back out. `children` is a function
 * receiving the signed-in user.
 */
export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [rejectedEmail, setRejectedEmail] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const accept = (next) => {
      if (!active) return;
      const email = next?.user?.email;
      if (next && !isOafEmail(email)) {
        setRejectedEmail(email || 'that account');
        setSession(null);
        signOut();
        return;
      }
      setSession(next || null);
    };

    supabase.auth.getSession().then(({ data }) => accept(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => accept(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    setError(null);
    setRejectedEmail(null);
    setSigningIn(true);
    const { error: signInError } = await signInWithGoogle();
    if (signInError) {
      setError(signInError.message);
      setSigningIn(false);
    }
    // On success the browser leaves for Google, then returns signed in
  };

  if (session === undefined) {
    return (
      <div className="h-screen w-full bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-green-400 animate-spin" aria-label="Checking sign-in" />
      </div>
    );
  }

  if (session) return children(session.user);

  return (
    <main className="min-h-screen w-full bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-7 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/20 rounded-lg border border-red-500/40">
            <Activity className="text-red-500 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">OneSecure</h1>
            <p className="text-xs text-gray-400">One Acre Fund Nigeria · Security Intelligence</p>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed">
          This map holds sensitive security information and is for One Acre Fund staff only.
        </p>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={signingIn}
          className="w-full py-3 rounded-lg bg-white hover:bg-gray-100 disabled:opacity-70 text-gray-900 font-semibold text-sm flex items-center justify-center gap-2.5 shadow"
        >
          {signingIn ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />}
          Sign in with your One Acre Fund Google account
        </button>

        {rejectedEmail && (
          <p className="text-xs text-red-300 flex items-start gap-1.5" role="alert">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" />
            {rejectedEmail} is not a One Acre Fund account. Sign in with your @{OAF_DOMAIN} email.
          </p>
        )}
        {error && (
          <p className="text-xs text-red-300 flex items-start gap-1.5" role="alert">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" /> Sign-in failed: {error}
          </p>
        )}

        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-green-500" /> Only @{OAF_DOMAIN} accounts can sign in.
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
