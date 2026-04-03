// Zero Risk V2 — API Helper Functions
// Client-side fetchers for use in React components

const API_BASE = '/api'

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// Campaigns
export const campaignsApi = {
  list: () => fetcher<unknown[]>('/campaigns'),
  create: (data: Record<string, unknown>) =>
    fetcher('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
}

// Leads
export const leadsApi = {
  list: () => fetcher<unknown[]>('/leads'),
  create: (data: Record<string, unknown>) =>
    fetcher('/leads', { method: 'POST', body: JSON.stringify(data) }),
}

// Content
export const contentApi = {
  list: () => fetcher<unknown[]>('/content'),
  create: (data: Record<string, unknown>) =>
    fetcher('/content', { method: 'POST', body: JSON.stringify(data) }),
}

// Health
export const healthApi = {
  check: () => fetcher<{ status: string; app: string; version: string; timestamp: string }>('/health'),
}
