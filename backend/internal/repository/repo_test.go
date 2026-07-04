package repository

import (
	"context"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
	_ "modernc.org/sqlite"
)

func setupDB(t *testing.T) *sqlx.DB {
	t.Helper()
	f, _ := os.CreateTemp("", "test-*.db")
	db, err := sqlx.Open("sqlite", f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); os.Remove(f.Name()) })
	Migrate(db)
	return db
}

func TestUserRepo_CreateAndFind(t *testing.T) {
	db := setupDB(t)
	repo := NewUserRepo(db)

	user, err := repo.Create(context.Background(), "alice", "hash123")
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if user.ID == 0 {
		t.Fatal("expected non-zero ID")
	}
	if user.Username != "alice" {
		t.Errorf("expected 'alice', got '%s'", user.Username)
	}

	found, err := repo.FindByID(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("FindByID failed: %v", err)
	}
	if found.Username != "alice" {
		t.Errorf("expected 'alice', got '%s'", found.Username)
	}
}

func TestUserRepo_DuplicateUsername(t *testing.T) {
	db := setupDB(t)
	repo := NewUserRepo(db)

	_, err := repo.Create(context.Background(), "alice", "hash1")
	if err != nil {
		t.Fatal(err)
	}
	_, err = repo.Create(context.Background(), "alice", "hash2")
	if err == nil {
		t.Fatal("expected error for duplicate username")
	}
}

func TestUserRepo_FindByUsername(t *testing.T) {
	db := setupDB(t)
	repo := NewUserRepo(db)

	repo.Create(context.Background(), "bob", "hash456")
	found, err := repo.FindByUsername(context.Background(), "bob")
	if err != nil {
		t.Fatalf("FindByUsername failed: %v", err)
	}
	if found.Username != "bob" {
		t.Errorf("expected 'bob', got '%s'", found.Username)
	}

	_, err = repo.FindByUsername(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent user")
	}
}

func TestSessionRepo_CreateAndList(t *testing.T) {
	db := setupDB(t)
	repo := NewSessionRepo(db)
	bal := 1000.0

	s, err := repo.Create(context.Background(), &model.Session{
		UserID: 1, Name: "test", Strategy: string(model.StratGrid),
		Mode: string(model.ModeSignal), Symbol: "BTC_USDT",
		Config: "{}", Status: string(model.StatStopped),
		VirtualBalance: &bal,
	})
	if err != nil {
		t.Fatalf("Create session failed: %v", err)
	}
	if s.ID == 0 {
		t.Fatal("expected non-zero ID")
	}

	sessions, err := repo.ListByUser(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Errorf("expected 1 session, got %d", len(sessions))
	}
}

func TestSessionRepo_UpdateStatus(t *testing.T) {
	db := setupDB(t)
	repo := NewSessionRepo(db)

	s, _ := repo.Create(context.Background(), &model.Session{
		UserID: 1, Name: "g1", Strategy: "grid",
		Mode: "signal", Symbol: "BTC_USDT", Config: "{}", Status: "stopped",
	})
	if err := repo.UpdateStatus(context.Background(), s.ID, "running"); err != nil {
		t.Fatal(err)
	}
	updated, _ := repo.FindByID(context.Background(), s.ID)
	if updated.Status != "running" {
		t.Errorf("expected 'running', got '%s'", updated.Status)
	}
}
