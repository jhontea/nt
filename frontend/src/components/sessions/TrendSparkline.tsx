'use client'

interface TrendSparklineProps {
  prices: number[]
  fastSMA: number[]
  slowSMA: number[]
  width?: number
  height?: number
  className?: string
}

function buildPath(data: number[], w: number, h: number, min: number, max: number): string {
  if (!data.length || max === min) return ''
  const range = max - min || 1
  return data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function TrendSparkline({ prices, fastSMA, slowSMA, width = 120, height = 32, className }: TrendSparklineProps) {
  if (!prices.length) return null

  const all = [...prices, ...fastSMA.filter(v => v > 0), ...slowSMA.filter(v => v > 0)]
  const min = Math.min(...all)
  const max = Math.max(...all)

  const pricePath = buildPath(prices, width, height, min, max)
  const fastPath = buildPath(fastSMA.filter(v => v > 0), width, height, min, max)
  const slowPath = buildPath(slowSMA.filter(v => v > 0), width, height, min, max)

  const lastPrice = prices[prices.length - 1]
  const isUp = prices.length >= 2 && prices[prices.length - 1] >= prices[prices.length - 2]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className}>
      {/* SMA slow - red */}
      {slowPath && <path d={slowPath} fill="none" stroke="#ff6b6f" strokeWidth="1" opacity="0.5" />}
      {/* SMA fast - green */}
      {fastPath && <path d={fastPath} fill="none" stroke="#9fe870" strokeWidth="1" opacity="0.5" />}
      {/* Price line */}
      {pricePath && <path d={pricePath} fill="none" stroke={isUp ? '#9fe870' : '#ff6b6f'} strokeWidth="1.5" />}
      {/* Current price dot */}
      <circle
        cx={width}
        cy={height - ((lastPrice - min) / (max - min || 1)) * height}
        r="2.5"
        fill={isUp ? '#9fe870' : '#ff6b6f'}
      />
    </svg>
  )
}
