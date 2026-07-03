# Task 14: Telegram Notifications — Report

**Status:** Complete

**Files created:**
- `backend/internal/service/notifier.go` — Telegram notification service

**Files modified:**
- `backend/internal/config/config.go` — Added `TelegramBotToken` and `TelegramChatID` fields
- `backend/internal/engine/manager.go` — Added `notifier` field, updated `NewManager` signature, added notification calls in `evaluate()`
- `backend/cmd/server/main.go` — Wired notifier into `engine.NewManager`
- `backend/.env.example` — Added `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`

**Build:** `go build ./cmd/server/` — passed (no errors)

**Concerns:** None.
