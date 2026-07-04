# Manual Testing Guide

## 1. Setup

```bash
# Backend
cd backend
cp .env.example .env          # or create manually
go run ./cmd/server/          # starts on :8100

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # starts on :3100
```

**.env file** (backend root):
```
PORT=8100
JWT_SECRET=test-secret-123
DATABASE_PATH=./data/trading.db
# Optional: fill these for live/paper mode
TOKO_API_KEY=
TOKO_SECRET_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

**Verify backend starts:**
```bash
curl http://localhost:8100/health
# → {"status":"ok"}
curl http://localhost:8100/ready
# → {"status":"ready"}
```

---

## 2. Auth — Register + Login

### Backend (curl)

```bash
# Register
curl -X POST http://localhost:8100/v1/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"secret123"}'

# Login
TOKEN=$(curl -s -X POST http://localhost:8100/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test1","password":"secret123"}' | jq -r '.token')
echo $TOKEN
```

### Frontend
1. Open http://localhost:3100
2. Click "Register" tab
3. Enter username `test1`, password `secret123` → click Register
4. Auto-login, redirected to session list (empty)

**Verify:** JWT stored in localStorage under key `token`. Token expires in 3 hours.

---

## 3. Session — Create (Signal/Grid)

### Backend

```bash
curl -X POST http://localhost:8100/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name":"grid-test-1",
    "strategy":"grid",
    "mode":"signal",
    "symbol":"BTC_USDT",
    "config":"{\"upper_price\":70000,\"lower_price\":60000,\"grid_count\":5,\"quantity\":\"0.001\"}"
  }'
# → 201, returns session object with id: 1
```

### Frontend
1. Click "Create Session"
2. Fill: Name=`grid-test-1`, Strategy=`Grid`, Mode=`Signal`, Symbol=`BTC_USDT`
3. Config: Upper=70000, Lower=60000, Grids=5, Qty=0.001
4. Click Create → redirected to detail page

**Verify:** Session card shows status `stopped`, strategy `grid`, mode `signal`.

---

## 4. Session — Start (Signal Mode)

```bash
curl -X POST http://localhost:8100/v1/sessions/1/start \
  -H "Authorization: Bearer $TOKEN"
# → {"status":"running"}
```

**Frontend:** Click "Start" button. Status changes to `running`.

### What happens
- Backend spawns a goroutine for session ID 1
- Every 30 seconds: evaluates Grid strategy against BTC_USDT price
- If price is at grid level → generates buy/sell **signal** (writes to `orders` table)
- Signals visible in orders table on detail page

**Wait 30-60 seconds, then verify:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/v1/sessions/1/orders
# → array of signal orders with status="signal"
```

**Frontend:** Orders table shows signals appearing after ~30s.

---

## 5. Session — P&L

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/v1/sessions/1/pnl
# → {"realized_pnl":"0.00","trade_count":0,"balance":0,"win_rate":0,"...":""}
```

For **Paper** mode sessions, balance shows virtual balance ($1000 initial).

**Frontend:** P&L cards at top of detail page show real-time stats.

---

## 6. Session — Stop

```bash
curl -X POST http://localhost:8100/v1/sessions/1/stop \
  -H "Authorization: Bearer $TOKEN"
# → {"status":"stopped"}
```

**Frontend:** Click "Stop". Status changes back to `stopped`.

**Verify:** No new signals appear after stopping (wait 30s to confirm).

---

## 7. Session — Update

```bash
curl -X PUT http://localhost:8100/v1/sessions/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"grid-renamed"}'
# → 200, returns updated session
```

**Frontend:** Edit name in detail page → save.

---

## 8. Session — List + Get

```bash
# List all sessions
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/v1/sessions
# → array

# Get one session
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/v1/sessions/1
# → single session object
```

---

## 9. Test All Strategies

### Grid (Signal)
```
config: {"upper_price":70000,"lower_price":60000,"grid_count":5,"quantity":"0.001"}
```
Creates 5 grid levels between 60000-70000. If BTC price is above 65000, generates sell signals at levels above price. Below 65000 → buy signals.

### Trend Following (Signal)
```
config: {"fast_period":5,"slow_period":10,"quantity":"0.001"}
```
Uses SMA crossover. Needs at least `slow_period` candles to start generating signals.

### DCA (Signal)
```
config: {"interval_sec":30,"amount":"10","take_profit_pct":5}
```
Buys $10 worth every 30 seconds. Sells when price is 5% above average buy price.

---

## 10. Test Paper Mode

Create a Paper mode session:
```bash
curl -X POST http://localhost:8100/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name":"paper-test",
    "strategy":"dca",
    "mode":"paper",
    "symbol":"BTC_USDT",
    "config":"{\"interval_sec\":30,\"amount\":\"10\",\"take_profit_pct\":10}"
  }'
# → note the returned id

# Start it
curl -X POST http://localhost:8100/v1/sessions/{id}/start \
  -H "Authorization: Bearer $TOKEN"
```

**Verify after 60-90 seconds:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/v1/sessions/{id}/orders
# → "filled" orders from paper buys
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8100/v1/sessions/{id}/pnl
# → balance < 1000 (deducted for buys)
```

**Frontend:** Orders table shows filled orders. P&L shows remaining balance.

---

## 11. WebSocket (Real-time)

```bash
# Install wscat first: npm install -g wscat
TOKEN="your-jwt-token-here"
wscat -c "ws://localhost:8100/ws/sessions/1?token=$TOKEN"
```

```json
// Expected message (after the 30s tick):
{"type":"signal","session_id":1,"signal":{"side":"buy","price":"65000.00","quantity":"0.001","reason":"grid_lower"}}
```

---

## 12. Error Scenarios

| Test | Expected |
|------|----------|
| Login with wrong password | `400` / "invalid credentials" |
| Register duplicate username | `400` / "username already exists" |
| Hit API with no token | `401` / "missing authorization header" |
| Hit API with expired token | `401` / "invalid or expired token" |
| Access another user's session | `403` / "access denied" |
| Create session with invalid config | `400` / validation error |
| Start already-running session | `400` / "session is already running" |
| Get non-existent session | `404` |


## 13. Clean Up

```bash
# Stop all sessions
# (automatic on server shutdown)
# Press Ctrl+C in backend terminal

# Delete test database
rm -rf backend/data/
```
