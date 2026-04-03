// Zero Risk V2 — Supabase Auth Helpers
// Simple email/password auth for Emilio + Xavier

import { getSupabase } from './supabase'

export async function signIn(email: string, password: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) return { user: null, session: null, error: error.message }
  return { user: data.user, session: data.session, error: null }
}

export async function signOut() {
  const supabase = getSupabase()
  const { error } = await supabase.auth.signOut()
  return { error: error?.message || null }
}

export async function getSession() {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.getSession()
  if (error) return { session: null, error: error.message }
  return { session: data.session, error: null }
}

export async function getUser() {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error) return { user: null, error: error.message }
  return { user: data.user, error: null }
}
