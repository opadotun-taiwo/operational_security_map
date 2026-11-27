import { supabase } from '../supabase';

/** Only One Acre Fund Google Workspace accounts may use the app. */
export const OAF_DOMAIN = 'oneacrefund.org';

export function isOafEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.endsWith(`@${OAF_DOMAIN}`) && e.indexOf('@') === e.lastIndexOf('@');
}

/** Sends the user to Google sign-in (Supabase Auth), restricted to the OAF domain. */
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      // `hd` makes Google offer only oneacrefund.org accounts; the email is checked again after sign-in
      queryParams: { hd: OAF_DOMAIN, prompt: 'select_account' }
    }
  });
}

export function signOut() {
  return supabase.auth.signOut();
}
