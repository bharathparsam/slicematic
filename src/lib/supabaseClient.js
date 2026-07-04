// supabaseClient.js
// Single Supabase browser client for the app. Configured from Vite env vars:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (see .env.example / .env.local)
// The anon key is safe to ship to the browser — access is governed by Supabase
// Auth + Row Level Security, not by hiding the key.
//
// If the env vars are absent the client is null and `isSupabaseConfigured` is
// false, so the UI can show a clear "not configured" state instead of crashing.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        // Persist the session in localStorage and refresh it automatically so an
        // admin stays signed in across reloads and the Modify round-trip.
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'slicematic-admin-auth',
      },
    })
  : null
