package handler

import (
	"testing"

	"github.com/user/nt/internal/model"
)

func TestFilterSessionsByStrategy(t *testing.T) {
	sessions := []model.Session{
		{Strategy: "grid"},
		{Strategy: "trend"},
		{Strategy: "grid"},
		{Strategy: "dca"},
	}
	if got := filterSessionsByStrategy(sessions, ""); len(got) != 4 {
		t.Fatalf("empty strategy should return all, got %d", len(got))
	}
	if got := filterSessionsByStrategy(sessions, "grid"); len(got) != 2 {
		t.Fatalf("grid filter should return 2, got %d", len(got))
	}
	if got := filterSessionsByStrategy(sessions, "dca"); len(got) != 1 {
		t.Fatalf("dca filter should return 1, got %d", len(got))
	}
}
