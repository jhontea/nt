package repository

import (
	"os"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func NewDB(dsn string) (*sqlx.DB, error) {
	driver := os.Getenv("DB_DRIVER")
	if driver == "" {
		driver = "sqlite"
	}
	if driver == "sqlite" && dsn == "" {
		dsn = "./data/trading.db"
	}

	db, err := sqlx.Open(driver, dsn)
	if err != nil {
		return nil, err
	}
	if driver == "sqlite" {
		db.SetMaxOpenConns(1)
	}
	return db, nil
}

func Migrate(db *sqlx.DB) error {
	driver := db.DriverName()
	schema := ""

	if driver == "sqlite" {
		schema = `
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
			is_active INTEGER DEFAULT 1,
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
			virtual_balance REAL DEFAULT 0,
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
	} else {
		schema = `
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(255) NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS api_keys (
			id SERIAL PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id),
			api_key TEXT NOT NULL,
			secret_key TEXT NOT NULL,
			is_active BOOLEAN DEFAULT TRUE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS sessions (
			id SERIAL PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id),
			name VARCHAR(255) NOT NULL,
			strategy VARCHAR(50) NOT NULL,
			mode VARCHAR(20) NOT NULL DEFAULT 'signal',
			symbol VARCHAR(50) NOT NULL,
			config TEXT NOT NULL DEFAULT '{}',
			status VARCHAR(20) NOT NULL DEFAULT 'stopped',
			virtual_balance REAL DEFAULT 0,
			started_at TIMESTAMP,
			stopped_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS orders (
			id SERIAL PRIMARY KEY,
			session_id INTEGER REFERENCES sessions(id),
			order_id VARCHAR(255) NOT NULL,
			symbol VARCHAR(50) NOT NULL,
			side VARCHAR(10) NOT NULL,
			type VARCHAR(20) NOT NULL,
			price VARCHAR(50) NOT NULL,
			quantity VARCHAR(50) NOT NULL,
			status VARCHAR(20) NOT NULL DEFAULT 'new',
			executed_qty VARCHAR(50) DEFAULT '0',
			executed_price VARCHAR(50) DEFAULT '0',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS trades (
			id SERIAL PRIMARY KEY,
			session_id INTEGER REFERENCES sessions(id),
			order_id VARCHAR(255) NOT NULL,
			symbol VARCHAR(50) NOT NULL,
			side VARCHAR(10) NOT NULL,
			price VARCHAR(50) NOT NULL,
			quantity VARCHAR(50) NOT NULL,
			fee VARCHAR(50) DEFAULT '0',
			fee_asset VARCHAR(20) DEFAULT 'USDT',
			pnl VARCHAR(50) DEFAULT '0',
			traded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS candles (
			id SERIAL PRIMARY KEY,
			symbol VARCHAR(50) NOT NULL,
			interval VARCHAR(10) NOT NULL,
			open_time BIGINT NOT NULL,
			open VARCHAR(50) NOT NULL,
			high VARCHAR(50) NOT NULL,
			low VARCHAR(50) NOT NULL,
			close VARCHAR(50) NOT NULL,
			volume VARCHAR(50) NOT NULL,
			UNIQUE(symbol, interval, open_time)
		);
		`
	}

	_, err := db.Exec(schema)
	return err
}
