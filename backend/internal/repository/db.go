package repository

import (
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/config"
)

func NewDB(cfg *config.Config) (*sqlx.DB, error) {
	driver := "pgx"
	db, err := sqlx.Open(driver, cfg.DSN())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(cfg.DBMaxConnections)
	db.SetMaxIdleConns(cfg.DBMaxIdleConns)
	return db, nil
}

func Migrate(db *sqlx.DB) error {
	driver := db.DriverName()
	schema := ""

	if driver == "pgx" || driver == "postgres" {
		schema = pgSchema
	} else {
		schema = sqliteSchema
	}

	_, err := db.Exec(schema)
	return err
}

const pgSchema = `
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

	CREATE TABLE IF NOT EXISTS strategy_signals (
		id SERIAL PRIMARY KEY,
		session_id INTEGER NOT NULL REFERENCES sessions(id),
		symbol VARCHAR(50) NOT NULL,
		strategy VARCHAR(50) NOT NULL,
		signal_type VARCHAR(10) NOT NULL,
		grid_level_index INTEGER NOT NULL,
		grid_level_price VARCHAR(50) NOT NULL,
		market_price_at_signal VARCHAR(50) NOT NULL,
		quantity VARCHAR(50) NOT NULL,
		reason VARCHAR(100) NOT NULL,
		validation_mode VARCHAR(20) NOT NULL DEFAULT 'grid_steps',
		validation_target_value REAL NOT NULL DEFAULT 2,
		validation_invalid_value REAL NOT NULL DEFAULT 1,
		validation_window_minutes INTEGER NOT NULL DEFAULT 120,
		validation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		validation_started_at TIMESTAMP,
		validation_finished_at TIMESTAMP,
		result_pct REAL,
		result_grid_steps REAL,
		max_favorable_move_pct REAL,
		max_adverse_move_pct REAL,
		max_favorable_grid_steps REAL,
		max_adverse_grid_steps REAL,
		validation_note TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_strategy_signals_session ON strategy_signals(session_id);
	CREATE INDEX IF NOT EXISTS idx_strategy_signals_status ON strategy_signals(validation_status);
	`

const sqliteSchema = `
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

	CREATE TABLE IF NOT EXISTS strategy_signals (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id INTEGER NOT NULL REFERENCES sessions(id),
		symbol TEXT NOT NULL,
		strategy TEXT NOT NULL,
		signal_type TEXT NOT NULL,
		grid_level_index INTEGER NOT NULL,
		grid_level_price TEXT NOT NULL,
		market_price_at_signal TEXT NOT NULL,
		quantity TEXT NOT NULL,
		reason TEXT NOT NULL,
		validation_mode TEXT NOT NULL DEFAULT 'grid_steps',
		validation_target_value REAL NOT NULL DEFAULT 2,
		validation_invalid_value REAL NOT NULL DEFAULT 1,
		validation_window_minutes INTEGER NOT NULL DEFAULT 120,
		validation_status TEXT NOT NULL DEFAULT 'pending',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		validation_started_at DATETIME,
		validation_finished_at DATETIME,
		result_pct REAL,
		result_grid_steps REAL,
		max_favorable_move_pct REAL,
		max_adverse_move_pct REAL,
		max_favorable_grid_steps REAL,
		max_adverse_grid_steps REAL,
		validation_note TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_strategy_signals_session ON strategy_signals(session_id);
	CREATE INDEX IF NOT EXISTS idx_strategy_signals_status ON strategy_signals(validation_status);
	`