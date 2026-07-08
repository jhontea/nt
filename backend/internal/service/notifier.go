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

func (n *Notifier) SendSignal(sessionName, strategy, mode, symbol, side, price, reason string) {
	sideEmoji := "🟢"
	sideLabel := "BELI"
	if side == string(model.SideSell) {
		sideEmoji = "🔴"
		sideLabel = "JUAL"
	}
	strategyLabel := map[string]string{
		"grid":  "📐 Grid",
		"trend": "📈 Trend",
		"dca":   "🪙 DCA",
	}[strategy]
	if strategyLabel == "" {
		strategyLabel = strategy
	}
	modeLabel := map[string]string{
		"signal": "📊 Signal",
		"paper":  "📝 Paper",
		"live":   "⚡ Live",
	}[mode]
	if modeLabel == "" {
		modeLabel = mode
	}
	msg := fmt.Sprintf(
		"%s <b>%s</b>\n"+
			"📋 <b>%s</b> · %s · %s\n"+
			"📊 Pair: <b>%s</b>\n"+
			"💵 Harga: <code>%s</code>\n"+
			"📝 <i>%s</i>\n"+
			"🕐 %s",
		sideEmoji, sideLabel,
		sessionName, strategyLabel, modeLabel,
		symbol, price, reason,
		time.Now().Format("15:04:05"),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram send signal", "error", err)
	}
}

func (n *Notifier) SendStopAlert(sessionName, symbol, reason string, totalValue, initBalance float64) {
	emoji := "🛑"
	label := "STOP LOSS"
	if reason == "take_profit" {
		emoji = "🎯"
		label = "TAKE PROFIT"
	}
	pnl := totalValue - initBalance
	pnlSign := "+"
	if pnl < 0 {
		pnlSign = ""
	}
	msg := fmt.Sprintf(
		"%s <b>%s TRIGGERED</b>\n"+
			"📊 Session: <b>%s</b> (%s)\n"+
			"💰 Total Value: <code>%.2f</code>\n"+
			"📈 Modal Awal: <code>%.2f</code>\n"+
			"📉 P&L: <b>%s%.2f</b>\n"+
			"🕐 %s",
		emoji, label, sessionName, symbol,
		totalValue, initBalance, pnlSign, pnl,
		time.Now().Format("15:04:05"),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram stop alert", "error", err)
	}
}

func (n *Notifier) SendPaperAlert(sessionName, symbol, reason string, needed, available float64) {
	msg := fmt.Sprintf(
		"⚠️ <b>Paper Alert</b>\n"+
			"📊 Session: <b>%s</b> (%s)\n"+
			"❌ %s\n"+
			"💰 Dibutuhkan: <code>%.2f</code> · Tersedia: <code>%.2f</code>\n"+
			"🕐 %s",
		sessionName, symbol, reason, needed, available, time.Now().Format("15:04:05"),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram paper alert", "error", err)
	}
}

func (n *Notifier) SendTrade(sessionName, strategy, mode, symbol, side, price, qty, pnl string) {
	emoji := "🟢"
	label := "BELI"
	if side == string(model.SideSell) {
		emoji = "🔴"
		label = "JUAL"
	}
	strategyLabel := map[string]string{
		"grid":  "📐 Grid",
		"trend": "📈 Trend",
		"dca":   "🪙 DCA",
	}[strategy]
	if strategyLabel == "" {
		strategyLabel = strategy
	}
	modeLabel := map[string]string{
		"signal": "📊 Signal",
		"paper":  "📝 Paper",
		"live":   "⚡ Live",
	}[mode]
	if modeLabel == "" {
		modeLabel = mode
	}
	pnlSign := ""
	if pnl != "" && pnl[0] != '-' {
		pnlSign = "+"
	}
	msg := fmt.Sprintf(
		"⚡ <b>TRADE %s</b> %s\n"+
			"📋 <b>%s</b> · %s · %s\n"+
			"📊 Pair: <b>%s</b>\n"+
			"💵 Harga: <code>%s</code>\n"+
			"📦 Qty: <code>%s</code>\n"+
			"💰 PnL: <b>%s%s</b>\n"+
			"🕐 %s",
		label, emoji,
		sessionName, strategyLabel, modeLabel,
		symbol, price, qty, pnlSign, pnl,
		time.Now().Format("15:04:05"),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram send trade", "error", err)
	}
}