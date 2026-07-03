# Trading Bot

Personal trading bot with Next.js dashboard + Go backend. Supports Grid Trading and Trend Following strategies with three modes: Signal, Paper, and Live.

## Tech Stack

- **Backend:** Go 1.26.4, Echo, sqlx
- **Frontend:** Next.js 16, TypeScript, Tailwind CSS
- **Database:** SQLite (default) or PostgreSQL
- **Auth:** JWT (3-hour expiry)
- **Exchange API:** TokoCrypto (HMAC SHA256)

## Quick Start

### Prerequisites

- Go 1.26+
- Node.js 22+
- TokoCrypto API key ([get one here](https://www.tokocrypto.com))

### Setup

```bash
# Clone and enter project
cd nt

# Backend
cd backend
cp .env.example .env
# Edit .env with your TokoCrypto API keys
go run ./cmd/server/

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

### Environment Variables (backend/.env)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 8100 | Backend port |
| DATABASE_PATH | ./data/trading.db | SQLite file path |
| JWT_SECRET | change-me | JWT signing secret |
| TOKO_API_KEY | - | TokoCrypto API key |
| TOKO_SECRET_KEY | - | TokoCrypto secret key |
| TELEGRAM_BOT_TOKEN | - | Telegram bot token (optional) |
| TELEGRAM_CHAT_ID | - | Telegram chat ID (optional) |

### Docker

```bash
docker-compose up --build
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/register | No | Register user |
| POST | /api/login | No | Login, returns JWT |
| GET | /api/health | No | Health check |
| GET | /api/sessions | Yes | List sessions |
| POST | /api/sessions | Yes | Create session |
| GET | /api/sessions/:id | Yes | Get session |
| PUT | /api/sessions/:id | Yes | Update session |
| POST | /api/sessions/:id/start | Yes | Start session |
| POST | /api/sessions/:id/stop | Yes | Stop session |
| GET | /api/sessions/:id/pnl | Yes | Get P&L summary |
| WS | /ws/sessions/:id | No | Real-time updates |

## Modes

- **Signal** — Strategies generate signals only, no execution
- **Paper** — Signals executed with virtual balance (starting $1000)
- **Live** — Real orders placed via TokoCrypto API

## Strategies

- **Grid Trading** — Place buy/sell orders at predefined price levels
- **Trend Following** — SMA crossover signals (golden cross/death cross)
