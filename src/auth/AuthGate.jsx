import React, { useEffect, useState } from 'react';
import { Activity, Loader2, ShieldCheck, AlertTriangle, MapPinned, Route, BadgeCheck } from 'lucide-react';
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
      <div className="h-screen w-full bg-gradient-to-br from-[#0f3d24] via-[#0b1f14] to-[#1a1208] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" aria-label="Checking sign-in" />
      </div>
    );
  }

  if (session) return children(session.user);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0b1f14] text-white">
      {/* Background: OAF green with soft orange and green glows over a faint map grid */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f3d24] via-[#0b1f14] to-[#1a1208]" />
      <div className="pointer-events-none absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-green-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-orange-500/25 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}
      />

      {/* Phones: intro, sign-in, features. Desktop: intro and features on the left, sign-in on the right */}
      <div className="relative mx-auto grid min-h-screen max-w-6xl content-center items-center gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-16 lg:gap-y-8">
        {/* What OneSecure is */}
        <section className="mx-auto max-w-xl text-center lg:col-start-1 lg:row-start-1 lg:mx-0 lg:text-left">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 backdrop-blur">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500">
              <Activity className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="text-sm font-semibold tracking-wide">OneSecure</span>
            <span className="text-xs text-green-200/80">One Acre Fund Nigeria</span>
          </div>

          <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">
            Security intelligence for <span className="text-orange-400">One Acre Fund</span> staff
          </h1>
          <p className="mt-4 text-base leading-relaxed text-green-50/80">
            Plan a trip and see which route to take, know what is happening around our hubs and sites,
            and keep up with security across OAF&apos;s operating areas.
          </p>
        </section>

        {/* Sign-in card */}
        <section className="mx-auto w-full max-w-sm lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="rounded-2xl bg-white p-7 text-gray-900 shadow-2xl shadow-black/40">
            <div className="h-1 w-12 rounded-full bg-gradient-to-r from-green-600 to-orange-500" />
            <h2 className="mt-5 text-xl font-bold">Welcome</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in with your One Acre Fund account to continue.</p>

            <button
              type="button"
              onClick={handleSignIn}
              disabled={signingIn}
              className="mt-6 flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 hover:shadow focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:opacity-60"
            >
              {signingIn ? <Loader2 size={18} className="animate-spin text-gray-500" /> : <GoogleMark />}
              {signingIn ? 'Opening Google…' : 'Sign in with Google'}
            </button>

            {rejectedEmail && (
              <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs text-red-700" role="alert">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {rejectedEmail} is not a One Acre Fund account. Please use your @{OAF_DOMAIN} email.
              </p>
            )}
            {error && (
              <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs text-red-700" role="alert">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Sign-in failed: {error}
              </p>
            )}

            <p className="mt-6 flex items-center gap-1.5 border-t border-gray-100 pt-4 text-xs text-gray-500">
              <ShieldCheck size={14} className="text-green-600" />
              For One Acre Fund staff only (@{OAF_DOMAIN}).
            </p>
          </div>
          <p className="mt-4 text-center text-xs text-green-50/50">
            Contains sensitive security information. Please do not share screenshots outside OAF.
          </p>
        </section>

        {/* Key features */}
        <section className="mx-auto w-full max-w-xl lg:col-start-1 lg:row-start-2 lg:mx-0">
          <ul className="grid gap-3 text-left">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/15 text-green-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-xs leading-relaxed text-green-50/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

const FEATURES = [
  { icon: MapPinned, title: 'Live security map', text: 'Recent incidents near our hubs and sites, with alerts when one is close.' },
  { icon: Route, title: 'Route Intelligence', text: 'Compare routes for a trip and see the risky stretches before you travel.' },
  { icon: BadgeCheck, title: 'Reviewed by the risk team', text: 'Incidents are checked with security contacts and marked as verified.' }
];

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
