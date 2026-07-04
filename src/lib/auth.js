// auth.js
// The authentication seam for the Admin portal. Components/App go through here,
// never touching supabase-js directly — the mirror of the orderStore pattern.
// Backed by Supabase Auth (email + password). Swapping providers later touches
// only this file.

import { supabase, isSupabaseConfigured } from './supabaseClient'

export { isSupabaseConfigured }

/**
 * Sign in an admin with email + password.
 * @returns {Promise<{ ok: boolean, session?: object, message?: string }>}
 */
export async function signIn(email, password) {
  if (!supabase) {
    return { ok: false, message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' }
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: (email ?? '').trim(),
    password: password ?? '',
  })
  if (error) {
    return { ok: false, message: friendlyAuthError(error) }
  }
  return { ok: true, session: data.session }
}

/** Sign the admin out (clears the persisted session). */
export async function signOut() {
  if (!supabase) return { ok: true }
  const { error } = await supabase.auth.signOut()
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

/** Current session (or null). Used once on load to restore a persisted login. */
export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session ?? null
}

/**
 * Subscribe to auth changes (sign in / out / token refresh). Calls `cb(session)`
 * on every change. Returns an unsubscribe function.
 */
export function onAuthChange(cb) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session ?? null))
  return () => data.subscription.unsubscribe()
}

/** The access token for the current session, for authorising API calls later. */
export async function getAccessToken() {
  const session = await getSession()
  return session?.access_token ?? null
}

/** Turn Supabase's raw error into a message safe + useful to show an operator. */
function friendlyAuthError(error) {
  const msg = error?.message ?? 'Sign-in failed.'
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.'
  if (/email not confirmed/i.test(msg)) return 'This email has not been confirmed yet.'
  return msg
}
