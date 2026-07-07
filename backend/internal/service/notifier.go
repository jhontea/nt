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
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode,omitempty"`
}

func (n *Notifier) sendHTML(text string) error {
	if !n.enabled {
		return nil
	}
	body, _ := json.Marshal(telegramMessage{
		ChatID:    n.chatID,
		Text:      text,
		ParseMode: "HTML",
	})
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.botToken)
	resp, err := n.http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
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
	emoji := fmt.Sprintf("🟢 %s", "BELI")
	if side == string(model.SideSell) {
		emoji = fmt.Sprintf("🔴 %s", "JUAL")
	}
	msg := fmt.Sprintf(
		"%s <b>%s</b>\n"+
			"📊 Pair: <b>%s</b>\n"+
			"💵 Harga: <code>%s</code>\n"+
			"📝 Alasan: <i>%s</i>\n"+
			"🕐 %s",
		emoji, side, symbol, price, reason, time.Now().Format("15:04:05"),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram send signal", "error", err)
	}
}

func (n *Notifier) SendTrade(symbol, side, price, qty, pnl string) {
	emoji := "🟢"
	label := "BELI"
	if side == string(model.SideSell) {
		emoji = "🔴"
		label = "JUAL"
	}
	pnlSign := ""
	if pnl != "" {
		if pnl[0] != '-' {
			pnlSign = "+"
		}
	}
	msg := fmt.Sprintf(
		"⚡ <b>TRADE %s</b> %s\n"+
			"📊 Pair: <b>%s</b>\n"+
			"💵 Harga: <code>%s</code>\n"+
			"📦 Qty: <code>%s</code>\n"+
			"💰 PnL: <b>%s%s</b>\n"+
			"🕐 %s",
		label, emoji, symbol, price, qty, pnlSign, pnl, time.Now().Format("15:04:05"),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram send trade", "error", err)
	}
}