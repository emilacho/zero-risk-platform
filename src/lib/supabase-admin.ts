// Zero Risk V2 — Supabase Server-Side Helpers
// Use these in API routes and server components

import { getSupabase } from './supabase'

// Generic query helper with error handling
export async function queryTable<T>(
  table: string,
  options?: {
    select?: string
    order?: { column: string; ascending?: boolean }
    limit?: number
    filters?: Array<{ column: string; operator: string; value: unknown }>
  }
): Promise<{ data: T[] | null; error: string | null }> {
  try {
    const supabase = getSupabase()
    let query = supabase.from(table).select(options?.select || '*')

    if (options?.filters) {
      for (const filter of options.filters) {
        query = query.filter(filter.column, filter.operator, filter.value)
      }
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? false,
      })
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) return { data: null, error: error.message }
    return { data: data as T[], error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Insert helper
export async function insertRow<T>(
  table: string,
  row: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from(table)
      .insert(row)
      .select()
      .single()

    if (error) return { data: null, error: error.message }
    return { data: data as T, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Update helper
export async function updateRow<T>(
  table: string,
  id: string,
  updates: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from(table)
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error: error.message }
    return { data: data as T, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// Count helper
export async function countRows(
  table: string,
  filters?: Array<{ column: string; operator: string; value: unknown }>
): Promise<{ count: number; error: string | null }> {
  try {
    const supabase = getSupabase()
    let query = supabase.from(table).select('*', { count: 'exact', head: true })

    if (filters) {
      for (const filter of filters) {
        query = query.filter(filter.column, filter.operator, filter.value)
      }
    }

    const { count, error } = await query

    if (error) return { count: 0, error: error.message }
    return { count: count || 0, error: null }
  } catch (err) {
    return { count: 0, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
