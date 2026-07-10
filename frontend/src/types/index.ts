export interface User {
  id: number
  username: string
  created_at: string
}

export interface Session {
  id: number
  user_id: number
  name: string
  strategy: 'grid' | 'trend' | 'dca'
  mode: 'signal' | 'paper' | 'live'
  symbol: string
  config: string
  status: 'stopped' | 'running' | 'paused'
  is_alive?: boolean
  virtual_balance?: number
  initial_balance?: number
  notes?: string
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
  interval?: string
  quantity: string
  capital?: number
  horizon?: 'short' | 'medium' | 'long'
  validation_mode?: 'percent'
  validation_target_value?: number
  validation_invalid_value?: number
  validation_window_minutes?: number
}

export interface TrendRecommendation {
  symbol: string
  current_price: number
  fast_period: number
  slow_period: number
  interval: string
  quantity: string
  validation_mode: 'percent'
  validation_target_value: number
  validation_invalid_value: number
  validation_window_minutes: number
  reason: string
}

export interface DCAConfig {
  interval_sec: number
  amount: string
  take_profit_pct?: number
  stop_loss_pct?: number
  drop_pct?: number
}

export interface Ticker {
  symbol: string
  lastPrice: string
  volume: string
  priceChange: string
  high24h: string
  low24h: string
}

export interface Mover {
  symbol: string
  lastPrice: string
  priceChangePercent: string
  volume: string
}

export interface MoversResponse {
  gainersUsdt: Mover[]
  gainersIdr: Mover[]
  hotUsdt: Mover[]
  hotIdr: Mover[]
}

export interface StrategySignal {
  id: number
  session_id: number
  symbol: string
  strategy: string
  signal_type: 'buy' | 'sell'
  grid_level_index: number
  grid_level_price: string
  market_price_at_signal: string
  quantity: string
  reason: string
  validation_mode: string
  validation_target_value: number
  validation_invalid_value: number
  validation_window_minutes: number
  validation_status: 'pending' | 'confirmed' | 'invalidated' | 'expired'
  created_at: string
  validation_started_at?: string
  validation_finished_at?: string
  result_pct?: number
  result_grid_steps?: number
  max_favorable_move_pct?: number
  max_adverse_move_pct?: number
  max_favorable_grid_steps?: number
  max_adverse_grid_steps?: number
  validation_note?: string
}

export interface SignalSummary {
  session_id: number
  total_count: number
  buy_count: number
  sell_count: number
  pending_count: number
  confirmed_count: number
  invalidated_count: number
  expired_count: number
  success_rate: number
}

export interface GridRecommendation {
  Symbol: string
  CurrentPrice: number
  UpperPrice: number
  LowerPrice: number
  GridCount: number
  StepSize: number
  Quantity: string
  ValidationMode: string
  ValidationTargetValue: number
  ValidationInvalidValue: number
  ValidationWindowMinutes: number
  Reason: string
}

export interface GridInsight {
  session_id: number
  name: string
  config: string
  total: number
  confirmed: number
  invalidated: number
  success_rate: number
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
  executed_quote_qty?: string
  created_at: string
}

export interface TrendSessionStatus {
  session_id: number
  session_name: string
  symbol: string
  mode: string
  fast_sma?: number
  slow_sma?: number
  cross_status: 'golden' | 'death' | 'neutral' | 'unknown'
  price_position_pct?: number
  current_price?: number
  recent_prices?: number[]
  recent_fast_sma?: number[]
  recent_slow_sma?: number[]
  next_candle_eta?: string
  holding_qty?: number
  holding_value?: number
  unrealized_pnl?: number
  unrealized_pnl_pct?: number
  last_signal_type?: string
  last_signal_result?: number
  last_signal_time?: string
  signal_history?: {
    side: string
    price: string
    result_pct?: number
    created_at: string
  }[]
}
