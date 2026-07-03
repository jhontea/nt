const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  })
  if (res.status === 401) {
    if (typeof window !== 'undefined') localStorage.removeItem('token')
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json()
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ token: string }>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (username: string, password: string) =>
      request<{ token: string }>('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  },
  sessions: {
    list: () => request<import('@/types').Session[]>('/api/sessions'),
    create: (data: { name: string; strategy: string; mode: string; symbol: string; config: string }) =>
      request<import('@/types').Session>('/api/sessions', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: number) => request<import('@/types').Session>(`/api/sessions/${id}`),
    update: (id: number, data: Partial<import('@/types').Session>) =>
      request<import('@/types').Session>(`/api/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    start: (id: number) => request<{ status: string }>(`/api/sessions/${id}/start`, { method: 'POST' }),
    stop: (id: number) => request<{ status: string }>(`/api/sessions/${id}/stop`, { method: 'POST' }),
  },
}
