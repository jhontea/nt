export interface User {
  id: number
  username: string
  created_at: string
}

export interface Session {
  id: number
  user_id: number
  name: string
  strategy: 'grid' | 'trend'
  mode: 'signal' | 'paper' | 'live'
  symbol: string
  config: string
  status: 'stopped' | 'running' | 'paused'
  started_at: string | null
  stopped_at: string | null
  created_at: string
}

export interface GridConfig {
  upper_price: number
  lower_price: number
  grid_count: number
  quantity: string
}

export interface TrendConfig {
  fast_period: number
  slow_period: number
  quantity: string
}

export interface Order {
  id: number
  session_id: number
  order_id: string
  symbol: string
  side: 'buy' | 'sell'
  type: string
  price: string
  quantity: string
  status: string
  executed_qty: string
  executed_price: string
  created_at: string
}
