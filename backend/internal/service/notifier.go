package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
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

// now returns a consistent timestamp string — date + time so midnight notifications are unambiguous.
func now() string {
	return time.Now().Format("02 Jan 15:04:05")
}

func strategyLabel(strategy string) string {
	if l, ok := map[string]string{
		"grid":  "📐 Grid",
		"trend": "📈 Trend",
		"dca":   "🪙 DCA",
	}[strategy]; ok {
		return l
	}
	return strategy
}

func modeLabel(mode string) string {
	if l, ok := map[string]string{
		"signal": "📊 Signal",
		"paper":  "📝 Paper",
		"live":   "⚡ Live",
	}[mode]; ok {
		return l
	}
	return mode
}

// fmtSymbol converts "BTC_USDT" → "BTC/USDT" for readability.
func fmtSymbol(symbol string) string {
	return strings.ReplaceAll(symbol, "_", "/")
}

// fmtPrice formats a price string with thousands separator and smart decimal trimming.
// "1234567.89000000" → "1,234,567.89"
// "0.00012345" → "0.00012345" (preserves small decimals)
func fmtPrice(price string) string {
	f, err := strconv.ParseFloat(price, 64)
	if err != nil {
		return price
	}
	return fmtFloat(f, 8)
}

// fmtFloat formats a float with thousands separator, trimming trailing zeros up to maxDec decimals.
func fmtFloat(f float64, maxDec int) string {
	if f == 0 {
		return "0"
	}
	// Choose decimal places based on magnitude
	dec := maxDec
	abs := math.Abs(f)
	switch {
	case abs >= 1000:
		dec = 2
	case abs >= 1:
		dec = 4
	case abs >= 0.01:
		dec = 6
	default:
		dec = 8
	}
	if dec > maxDec {
		dec = maxDec
	}
	s := strconv.FormatFloat(f, 'f', dec, 64)
	// Trim trailing zeros after decimal point
	if strings.Contains(s, ".") {
		s = strings.TrimRight(s, "0")
		s = strings.TrimRight(s, ".")
	}
	// Add thousands separator to integer part
	parts := strings.SplitN(s, ".", 2)
	parts[0] = addThousands(parts[0])
	if len(parts) == 2 {
		return parts[0] + "." + parts[1]
	}
	return parts[0]
}

// addThousands adds comma separators to an integer string, handling negative sign.
func addThousands(s string) string {
	neg := false
	if strings.HasPrefix(s, "-") {
		neg = true
		s = s[1:]
	}
	n := len(s)
	if n <= 3 {
		if neg {
			return "-" + s
		}
		return s
	}
	var b strings.Builder
	rem := n % 3
	if rem > 0 {
		b.WriteString(s[:rem])
		if n > rem {
			b.WriteByte(',')
		}
	}
	for i := rem; i < n; i += 3 {
		b.WriteString(s[i : i+3])
		if i+3 < n {
			b.WriteByte(',')
		}
	}
	if neg {
		return "-" + b.String()
	}
	return b.String()
}

// fmtQty formats a quantity string, trimming unnecessary trailing zeros.
// "0.00100000" → "0.001", "10.00000000" → "10"
func fmtQty(qty string) string {
	f, err := strconv.ParseFloat(qty, 64)
	if err != nil {
		return qty
	}
	return fmtFloat(f, 8)
}

// fmtPnL formats a PnL float with sign, thousands separator and 2 decimals.
func fmtPnL(pnl float64) string {
	sign := "+"
	if pnl < 0 {
		sign = ""
	}
	return sign + fmtFloat(pnl, 2)
}

// fmtPnLStr parses and formats a PnL string.
func fmtPnLStr(pnl string) string {
	f, err := strconv.ParseFloat(pnl, 64)
	if err != nil {
		return pnl
	}
	return fmtPnL(f)
}

// sideNotice returns a high-visibility prefix for transaction notifications.
// BUY/SELL intentionally stays in English so the side is recognizable at a glance.
func sideNotice(side string) (emoji, prefix, label string) {
	if side == string(model.SideSell) {
		return "🔴", "[SELL]", "JUAL"
	}
	return "🟢", "[BUY]", "BELI"
}

// reasonLabel maps internal reason codes to human-readable Indonesian.
func reasonLabel(reason string) string {
	labels := map[string]string{
		"grid_buy_level":         "Harga menyentuh level beli grid",
		"grid_sell_level":        "Harga menyentuh level jual grid",
		"golden_cross":           "Golden Cross — SMA cepat memotong ke atas",
		"death_cross":            "Death Cross — SMA cepat memotong ke bawah",
		"dca_interval":           "Interval DCA tercapai",
		"dca_drop":               "Harga turun sesuai target DCA",
		"dca_reentry_below_sell": "Harga turun di bawah harga jual terakhir",
		"dca_take_profit":        "Take Profit DCA tercapai",
		"dca_stop_loss":          "Stop Loss DCA tercapai",
	}
	// prefix match for grid levels: "grid_buy_level_3" → "Harga menyentuh level beli 3"
	for prefix, label := range map[string]string{
		"grid_buy_level_":  "Harga menyentuh level beli #",
		"grid_sell_level_": "Harga menyentuh level jual #",
	} {
		if strings.HasPrefix(reason, prefix) {
			return label + strings.TrimPrefix(reason, prefix)
		}
	}
	if l, ok := labels[reason]; ok {
		return l
	}
	return reason
}

// divider returns a thin separator line for Telegram HTML messages.
const divider = "─────────────────"

// SendSignal — signal mode: new signal generated (not yet executed).
func (n *Notifier) SendSignal(sessionName, strategy, mode, symbol, side, price, qty, reason string) {
	sideEmoji, sidePrefix, sideLabel := sideNotice(side)
	qtyLine := ""
	if qty != "" && qty != "0" {
		qtyLine = fmt.Sprintf("\n📦 Qty: <code>%s</code>", fmtQty(qty))
	}
	msg := fmt.Sprintf(
		"%s <b>%s SINYAL %s</b>\n"+
			"<i>%s · %s · %s</i>\n"+
			divider+"\n"+
			"🪙 Pair: <b>%s</b>\n"+
			"💵 Harga: <code>%s</code>%s\n"+
			"📝 %s\n"+
			divider+"\n"+
			"🕐 <i>%s</i>",
		sideEmoji, sidePrefix, sideLabel,
		sessionName, strategyLabel(strategy), modeLabel(mode),
		fmtSymbol(symbol), fmtPrice(price), qtyLine,
		reasonLabel(reason),
		now(),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram send signal", "error", err)
	}
}

// SendTrade — paper/live trade executed (buy or sell).
// pnl is only shown for sell trades; pass empty string for buy.
func (n *Notifier) SendTrade(sessionName, strategy, mode, symbol, side, price, qty, pnl string) {
	emoji, prefix, label := sideNotice(side)

	pnlLine := ""
	if side == string(model.SideSell) && pnl != "" && pnl != "0" {
		pnlLine = fmt.Sprintf("\n💰 PnL: <b>%s</b>", fmtPnLStr(pnl))
	}

	msg := fmt.Sprintf(
		"%s <b>%s TRADE %s</b>\n"+
			"<i>%s · %s · %s</i>\n"+
			divider+"\n"+
			"🪙 Pair: <b>%s</b>\n"+
			"💵 Harga: <code>%s</code>\n"+
			"📦 Qty: <code>%s</code>%s\n"+
			divider+"\n"+
			"🕐 <i>%s</i>",
		emoji, prefix, label,
		sessionName, strategyLabel(strategy), modeLabel(mode),
		fmtSymbol(symbol), fmtPrice(price), fmtQty(qty), pnlLine,
		now(),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram send trade", "error", err)
	}
}

// SendLiveTrade — live order confirmed on exchange.
// Distinct from SendSignal: confirms actual execution with order ID and filled price/qty.
func (n *Notifier) SendLiveTrade(sessionName, strategy, symbol, side, orderID, execPrice, execQty, pnl string) {
	emoji, prefix, label := sideNotice(side)

	pnlLine := ""
	if side == string(model.SideSell) && pnl != "" && pnl != "0" {
		pnlLine = fmt.Sprintf("\n💰 PnL: <b>%s</b>", fmtPnLStr(pnl))
	}

	orderLine := ""
	if orderID != "" {
		orderLine = fmt.Sprintf("\n🔖 Order ID: <code>%s</code>", orderID)
	}

	msg := fmt.Sprintf(
		"%s <b>%s ORDER TEREKSEKUSI — %s</b>\n"+
			"<i>%s · %s · ⚡ Live</i>\n"+
			divider+"\n"+
			"🪙 Pair: <b>%s</b>\n"+
			"💵 Harga Eksekusi: <code>%s</code>\n"+
			"📦 Qty Terisi: <code>%s</code>%s%s\n"+
			divider+"\n"+
			"🕐 <i>%s</i>",
		emoji, prefix, label,
		sessionName, strategyLabel(strategy),
		fmtSymbol(symbol), fmtPrice(execPrice), fmtQty(execQty), pnlLine, orderLine,
		now(),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram send live trade", "error", err)
	}
}

// SendStopAlert — SL/TP triggered, session auto-stopped.
func (n *Notifier) SendStopAlert(sessionName, strategy, mode, symbol, reason string, totalValue, initBalance float64) {
	emoji := "🛑"
	label := "STOP LOSS"
	if reason == "take_profit" {
		emoji = "🎯"
		label = "TAKE PROFIT"
	}
	pnl := totalValue - initBalance
	pnlPct := 0.0
	if initBalance > 0 {
		pnlPct = pnl / initBalance * 100
	}
	pnlSign := "+"
	if pnlPct < 0 {
		pnlSign = ""
	}
	msg := fmt.Sprintf(
		"%s <b>%s TRIGGERED</b>\n"+
			"<i>%s · %s · %s</i>\n"+
			divider+"\n"+
			"🪙 Pair: <b>%s</b>\n"+
			"💰 Nilai Akhir: <code>%s</code>\n"+
			"📈 Modal Awal: <code>%s</code>\n"+
			"📉 P&amp;L: <b>%s</b> (<b>%s%.1f%%</b>)\n"+
			divider+"\n"+
			"🕐 <i>%s</i>",
		emoji, label,
		sessionName, strategyLabel(strategy), modeLabel(mode),
		fmtSymbol(symbol),
		fmtFloat(totalValue, 2),
		fmtFloat(initBalance, 2),
		fmtPnL(pnl), pnlSign, pnlPct,
		now(),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram stop alert", "error", err)
	}
}

// SendPaperAlert — paper trading warning (insufficient balance, no asset to sell, etc).
func (n *Notifier) SendPaperAlert(sessionName, symbol, reason string, needed, available float64) {
	reasonLabel := reason
	switch reason {
	case "insufficient_balance":
		reasonLabel = "Saldo tidak cukup untuk menempatkan order beli"
	case "no_asset_to_sell":
		reasonLabel = "Tidak ada aset terbuka untuk dijual"
	}

	amountLine := ""
	if needed > 0 || available > 0 {
		amountLine = fmt.Sprintf("\n💵 Dibutuhkan: <code>%s</code>\n💼 Tersedia: <code>%s</code>",
			fmtFloat(needed, 4), fmtFloat(available, 4))
	}

	msg := fmt.Sprintf(
		"⚠️ <b>Paper Alert</b>\n"+
			"<i>%s · %s</i>\n"+
			divider+"\n"+
			"❌ %s%s\n"+
			divider+"\n"+
			"🕐 <i>%s</i>",
		sessionName, fmtSymbol(symbol), reasonLabel, amountLine,
		now(),
	)
	if err := n.sendHTML(msg); err != nil {
		slog.Warn("telegram paper alert", "error", err)
	}
}
