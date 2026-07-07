const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8100'

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
      request<{ token: string }>('/v1/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (username: string, password: string) =>
      request<{ token: string }>('/v1/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  },
  sessions: {
    list: () => request<import('@/types').Session[]>('/v1/sessions'),
    create: (data: { name: string; strategy: string; mode: string; symbol: string; config: string }) =>
      request<import('@/types').Session>('/v1/sessions', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: number) => request<import('@/types').Session>(`/v1/sessions/${id}`),
    update: (id: number, data: Partial<import('@/types').Session>) =>
      request<import('@/types').Session>(`/v1/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    start: (id: number) => request<{ status: string }>(`/v1/sessions/${id}/start`, { method: 'POST' }),
    stop: (id: number) => request<{ status: string }>(`/v1/sessions/${id}/stop`, { method: 'POST' }),
    delete: (id: number) => request<{ status: string }>(`/v1/sessions/${id}`, { method: 'DELETE' }),
    getPnL: (id: number) => request<{ realized_pnl: string; total_pnl: string; win_rate: number; trade_count: number; balance: number }>(`/v1/sessions/${id}/pnl`),
    getOrders: (id: number) => request<import('@/types').Order[]>(`/v1/sessions/${id}/orders`),
    getTicker: (symbol: string) => request<import('@/types').Ticker>(`/v1/ticker/${symbol}`),
    getTickersBulk: (symbols: string[]) => request<Record<string, import('@/types').Ticker>>(`/v1/tickers?symbols=${symbols.join(',')}`),
    getSignals: (id: number) => request<import('@/types').StrategySignal[]>(`/v1/sessions/${id}/signals`),
    getSignalSummary: (id: number) => request<import('@/types').SignalSummary>(`/v1/sessions/${id}/signals/summary`),
  },
  grid: {
    recommend: (params: { symbol: string; horizon: string; capital: number; validation_mode?: string }) =>
      request<import('@/types').GridRecommendation>(`/v1/grid/recommend?symbol=${params.symbol}&horizon=${params.horizon}&capital=${params.capital}&validation_mode=${params.validation_mode || 'grid_steps'}`),
    insights: (symbol: string) =>
      request<import('@/types').GridInsight[]>(`/v1/grid/insights?symbol=${symbol}`),
  },
}
