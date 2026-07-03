package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/user/nt/internal/model"
)

type Notifier struct {
	botToken string
	chatID   string
	http     *http.Client
	enabled  bool
}

func NewNotifier(botToken, chatID string) *Notifier {
	return &Notifier{
		botToken: botToken,
		chatID:   chatID,
		http:     &http.Client{Timeout: 10 * time.Second},
		enabled:  botToken != "" && chatID != "",
	}
}

type telegramMessage struct {
	ChatID string `json:"chat_id"`
	Text   string `json:"text"`
}

func (n *Notifier) Send(text string) error {
	if !n.enabled {
		return nil
	}
	body, _ := json.Marshal(telegramMessage{
		ChatID: n.chatID,
		Text:   text,
	})
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.botToken)
	resp, err := n.http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (n *Notifier) SendSignal(symbol, side, price, reason string) {
	if err := n.Send(fmt.Sprintf("🔔 Signal: %s %s %s @ %s", side, symbol, reason, price)); err != nil {
		slog.Warn("telegram send", "error", err)
	}
}

func (n *Notifier) SendTrade(symbol, side, price, qty, pnl string) {
	emoji := "🟢"
	if side == string(model.SideSell) {
		emoji = "🔴"
	}
	if err := n.Send(fmt.Sprintf("%s %s %s %s @ %s | PnL: %s", emoji, symbol, side, qty, price, pnl)); err != nil {
		slog.Warn("telegram send", "error", err)
	}
}
