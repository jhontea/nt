package repository

import (
    "github.com/jmoiron/sqlx"
    _ "modernc.org/sqlite"
)

func NewDB(path string) (*sqlx.DB, error) {
    db, err := sqlx.Open("sqlite", path)
    if err != nil {
        return nil, err
    }
    db.SetMaxOpenConns(1)
    return db, nil
}

func Migrate(db *sqlx.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS api_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id),
		api_key TEXT NOT NULL,
		secret_key TEXT NOT NULL,
		is_active BOOLEAN DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL REFERENCES users(id),
		name TEXT NOT NULL,
		strategy TEXT NOT NULL,
		mode TEXT NOT NULL DEFAULT 'signal',
		symbol TEXT NOT NULL,
		config TEXT NOT NULL DEFAULT '{}',
		status TEXT NOT NULL DEFAULT 'stopped',
		started_at DATETIME,
		stopped_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS orders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id INTEGER REFERENCES sessions(id),
		order_id TEXT NOT NULL,
		symbol TEXT NOT NULL,
		side TEXT NOT NULL,
		type TEXT NOT NULL,
		price TEXT NOT NULL,
		quantity TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'new',
		executed_qty TEXT DEFAULT '0',
		executed_price TEXT DEFAULT '0',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS trades (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id INTEGER REFERENCES sessions(id),
		order_id TEXT NOT NULL,
		symbol TEXT NOT NULL,
		side TEXT NOT NULL,
		price TEXT NOT NULL,
		quantity TEXT NOT NULL,
		fee TEXT DEFAULT '0',
		fee_asset TEXT DEFAULT 'USDT',
		pnl TEXT DEFAULT '0',
		traded_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS candles (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		symbol TEXT NOT NULL,
		interval TEXT NOT NULL,
		open_time INTEGER NOT NULL,
		open TEXT NOT NULL,
		high TEXT NOT NULL,
		low TEXT NOT NULL,
		close TEXT NOT NULL,
		volume TEXT NOT NULL,
		UNIQUE(symbol, interval, open_time)
	);
	`
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	// ponytail: ALTER TABLE may fail if column already exists, that's fine
	db.Exec("ALTER TABLE sessions ADD COLUMN virtual_balance REAL DEFAULT 0")
	return nil
}
