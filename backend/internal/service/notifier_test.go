package service

import "testing"

func TestSideNotice(t *testing.T) {
	tests := []struct {
		side       string
		wantEmoji  string
		wantPrefix string
		wantLabel  string
	}{
		{side: "buy", wantEmoji: "🟢", wantPrefix: "[BUY]", wantLabel: "BELI"},
		{side: "sell", wantEmoji: "🔴", wantPrefix: "[SELL]", wantLabel: "JUAL"},
	}

	for _, tt := range tests {
		t.Run(tt.side, func(t *testing.T) {
			emoji, prefix, label := sideNotice(tt.side)
			if emoji != tt.wantEmoji || prefix != tt.wantPrefix || label != tt.wantLabel {
				t.Fatalf("sideNotice(%q) = (%q, %q, %q), want (%q, %q, %q)",
					tt.side, emoji, prefix, label, tt.wantEmoji, tt.wantPrefix, tt.wantLabel)
			}
		})
	}
}
