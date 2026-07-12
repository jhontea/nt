package repository

import (
	"context"
	"os"
	"testing"
	"time"

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

	sessions, err := repo.ListByUser(context.Background(), 1, 50, 0)
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

func TestSessionRepo_FindByID_NotFound(t *testing.T) {
	db := setupDB(t)
	repo := NewSessionRepo(db)

	_, err := repo.FindByID(context.Background(), 999)
	if err == nil {
		t.Fatal("expected error for non-existent session")
	}
}

func TestSessionRepo_Update(t *testing.T) {
	db := setupDB(t)
	repo := NewSessionRepo(db)

	s, _ := repo.Create(context.Background(), &model.Session{
		UserID: 1, Name: "original", Strategy: "grid",
		Mode: "signal", Symbol: "BTC_USDT", Config: `{"a":1}`, Status: "stopped",
	})

	s.Name = "updated"
	s.Config = `{"b":2}`
	s.Symbol = "ETH_USDT"
	s.Strategy = "trend"

	if err := repo.Update(context.Background(), s); err != nil {
		t.Fatal(err)
	}

	updated, _ := repo.FindByID(context.Background(), s.ID)
	if updated.Name != "updated" {
		t.Errorf("expected 'updated', got '%s'", updated.Name)
	}
	if updated.Config != `{"b":2}` {
		t.Errorf("expected config `{\"b\":2}`, got '%s'", updated.Config)
	}
	if updated.Symbol != "ETH_USDT" {
		t.Errorf("expected 'ETH_USDT', got '%s'", updated.Symbol)
	}
}

func TestSessionRepo_UpdateStartedAt(t *testing.T) {
	db := setupDB(t)
	repo := NewSessionRepo(db)

	s, _ := repo.Create(context.Background(), &model.Session{
		UserID: 1, Name: "s", Strategy: "grid",
		Mode: "signal", Symbol: "BTC_USDT", Config: "{}", Status: "stopped",
	})

	if err := repo.UpdateStartedAt(context.Background(), s.ID); err != nil {
		t.Fatal(err)
	}

	updated, _ := repo.FindByID(context.Background(), s.ID)
	if updated.StartedAt == nil {
		t.Error("expected started_at to be set")
	}
}

func TestSessionRepo_RestartPreservesDCACycleStart(t *testing.T) {
	db := setupDB(t)
	repo := NewSessionRepo(db)
	s, err := repo.Create(context.Background(), &model.Session{
		UserID: 1, Name: "dca", Strategy: "dca", Mode: "live",
		Symbol: "BTC_IDR", Config: `{}`, Status: "stopped",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := repo.UpdateStarted(context.Background(), s.ID); err != nil {
		t.Fatal(err)
	}
	first, _ := repo.FindByID(context.Background(), s.ID)
	if first.StartedAt == nil {
		t.Fatal("first start did not set started_at")
	}
	want := *first.StartedAt

	if err := repo.UpdateStopped(context.Background(), s.ID); err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)
	if err := repo.UpdateStarted(context.Background(), s.ID); err != nil {
		t.Fatal(err)
	}
	restarted, _ := repo.FindByID(context.Background(), s.ID)
	if restarted.StartedAt == nil || !restarted.StartedAt.Equal(want) {
		t.Fatalf("restart changed cycle start: got %v, want %v", restarted.StartedAt, want)
	}
}

func TestSessionRepo_UpdateStoppedAt(t *testing.T) {
	db := setupDB(t)
	repo := NewSessionRepo(db)

	s, _ := repo.Create(context.Background(), &model.Session{
		UserID: 1, Name: "s", Strategy: "grid",
		Mode: "signal", Symbol: "BTC_USDT", Config: "{}", Status: "stopped",
	})

	if err := repo.UpdateStoppedAt(context.Background(), s.ID); err != nil {
		t.Fatal(err)
	}

	updated, _ := repo.FindByID(context.Background(), s.ID)
	if updated.StoppedAt == nil {
		t.Error("expected stopped_at to be set")
	}
}

func TestMigrate_SQLite(t *testing.T) {
	db, err := sqlx.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := Migrate(db); err != nil {
		t.Fatalf("Migrate failed: %v", err)
	}

	rows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	tables := []string{}
	for rows.Next() {
		var name string
		rows.Scan(&name)
		tables = append(tables, name)
	}
	expected := []string{"api_keys", "candles", "orders", "sessions", "strategy_signals", "trades", "users"}
	for _, e := range expected {
		found := false
		for _, t := range tables {
			if t == e {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected table %s to exist, got %v", e, tables)
		}
	}

	if _, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, client_id, symbol, side, type, price, quantity, status)
		VALUES (NULL, '', 'intent-1', 'BTC_IDR', 'buy', 'market', '0', '0', 'submitting')`); err != nil {
		t.Fatalf("client_id column is not usable: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO orders
		(session_id, order_id, client_id, symbol, side, type, price, quantity, status)
		VALUES (NULL, '', 'intent-1', 'BTC_IDR', 'buy', 'market', '0', '0', 'submitting')`); err == nil {
		t.Fatal("expected duplicate client_id to be rejected")
	}
}

func TestMigrate_Idempotent(t *testing.T) {
	db, err := sqlx.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := Migrate(db); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(db); err != nil {
		t.Fatalf("second migrate failed: %v", err)
	}
}
