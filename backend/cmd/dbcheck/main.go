// Temporary diagnostic tool: inspects NeonDB usage/storage.
// Reads DSN from env var NEON_DSN. Not part of the app.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/config"
	"github.com/user/nt/internal/repository"
	_ "modernc.org/sqlite"
)

func main() {
	// SQLite-only subcommands do not need Neon.
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "sqlite":
			path := os.Getenv("SQLITE_PATH")
			if path == "" {
				fmt.Println("SQLITE_PATH env var is required")
				os.Exit(1)
			}
			inspectSQLite(path)
			return
		case "smoke":
			path := os.Getenv("SQLITE_PATH")
			if path == "" {
				fmt.Println("SQLITE_PATH env var is required")
				os.Exit(1)
			}
			smokeSQLite(path)
			return
		case "backup":
			path := os.Getenv("SQLITE_PATH")
			out := os.Getenv("BACKUP_PATH")
			if path == "" || out == "" {
				fmt.Println("SQLITE_PATH and BACKUP_PATH env vars are required")
				os.Exit(1)
			}
			backupSQLite(path, out)
			return
		}
	}

	dsn := os.Getenv("NEON_DSN")
	if dsn == "" {
		fmt.Println("NEON_DSN env var is required")
		os.Exit(1)
	}
	// pgx does not understand channel_binding; drop it.
	dsn = stripParam(dsn, "channel_binding")

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		fmt.Println("CONNECT ERROR:", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	if len(os.Args) > 1 && os.Args[1] == "apply" {
		applyIndexes(ctx, conn)
		return
	}

	// migrate: copy all app tables from Neon (source, NEON_DSN) into a local
	// SQLite file (target, SQLITE_PATH).
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		path := os.Getenv("SQLITE_PATH")
		if path == "" {
			fmt.Println("SQLITE_PATH env var is required")
			os.Exit(1)
		}
		if err := migrateNeonToSQLite(ctx, conn, path); err != nil {
			fmt.Println("MIGRATE ERROR:", err)
			os.Exit(1)
		}
		fmt.Println("MIGRATE OK ->", path)
		return
	}

	run(ctx, conn, "== 1. DATABASE SIZE ==",
		`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
		        pg_size_pretty(pg_database_size(current_database()) + pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')) AS with_wal`)

	run(ctx, conn, "== 2. TABLE SIZES (data+index+toast, ALL) ==",
		`SELECT n.nspname AS schema, c.relname,
		        pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
		        pg_size_pretty(pg_relation_size(c.oid))      AS table_only,
		        pg_size_pretty(pg_indexes_size(c.oid))       AS indexes
		 FROM pg_class c
		 JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE c.relkind = 'r' AND n.nspname = 'public'
		 ORDER BY pg_total_relation_size(c.oid) DESC`)

	run(ctx, conn, "== 2b. TABLE STATS (live/dead tuples, scans) ==",
		`SELECT relname, n_live_tup, n_dead_tup, seq_scan, seq_tup_read,
		        idx_scan, last_vacuum, last_autovacuum, last_analyze
		 FROM pg_stat_user_tables ORDER BY seq_scan DESC`)

	run(ctx, conn, "== 2c. BLOCK HIT / I/O (disk read vs cache) ==",
		`SELECT relname, heap_blks_read, heap_blks_hit,
		        idx_blks_read, idx_blks_hit
		 FROM pg_statio_user_tables ORDER BY heap_blks_read DESC`)

	run(ctx, conn, "== 3. ROW COUNTS ==",
		`SELECT 'orders' AS tbl, count(*) FROM orders
		 UNION ALL SELECT 'trades', count(*) FROM trades
		 UNION ALL SELECT 'strategy_signals', count(*) FROM strategy_signals
		 UNION ALL SELECT 'sessions', count(*) FROM sessions
		 UNION ALL SELECT 'users', count(*) FROM users`)

	run(ctx, conn, "== 4. ORDERS GROWTH PER DAY (last 14) ==",
		`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*) AS cnt
		 FROM orders GROUP BY 1 ORDER BY 1 DESC LIMIT 14`)

	run(ctx, conn, "== 5. SIGNALS GROWTH PER DAY (last 14) ==",
		`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*) AS cnt
		 FROM strategy_signals GROUP BY 1 ORDER BY 1 DESC LIMIT 14`)

	run(ctx, conn, "== 6. SEQUENTIAL SCAN vs INDEX SCAN ==",
		`SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
		 FROM pg_stat_user_tables ORDER BY seq_scan DESC`)

	run(ctx, conn, "== 7. EXISTING INDEXES ==",
		`SELECT tablename, indexname, indexdef FROM pg_indexes
		 WHERE schemaname='public' ORDER BY tablename, indexname`)

	run(ctx, conn, "== 8. ORDERS BY SESSION (top 15) ==",
		`SELECT session_id, count(*) AS cnt
		 FROM orders GROUP BY session_id ORDER BY cnt DESC LIMIT 15`)

	run(ctx, conn, "== 9. SESSIONS ==",
		`SELECT id, name, strategy, mode, symbol, status, created_at, started_at, stopped_at
		 FROM sessions ORDER BY created_at DESC LIMIT 20`)

	run(ctx, conn, "== 10. TOP QUERIES BY CALLS (pg_stat_statements) ==",
		`SELECT calls, round(total_exec_time::numeric,1) AS total_ms,
		        round(mean_exec_time::numeric,1) AS avg_ms, rows,
		        left(query, 140) AS query
		 FROM pg_stat_statements ORDER BY calls DESC LIMIT 15`)

	run(ctx, conn, "== 11. TOP QUERIES BY TOTAL TIME ==",
		`SELECT calls, round(total_exec_time::numeric,1) AS total_ms,
		        round(mean_exec_time::numeric,1) AS avg_ms, rows,
		        left(query, 140) AS query
		 FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15`)

	run(ctx, conn, "== 12. ACTIVE/BACKEND CONNECTIONS ==",
		`SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY count(*) DESC`)

	run(ctx, conn, "== 13. WAL / HISTORY (current) ==",
		`SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0')) AS wal_pos,
		        pg_size_pretty(sum(size)) AS wal_files
		 FROM pg_ls_waldir()`)

	run(ctx, conn, "== 14. NAVISHA NOTE TABLES (other project sharing this DB) ==",
		`SELECT 'navisha_note_categories' t, count(*) FROM navisha_note_categories
		 UNION ALL SELECT 'navisha_note_transactions', count(*) FROM navisha_note_transactions
		 UNION ALL SELECT 'navisha_note_groups', count(*) FROM navisha_note_groups
		 UNION ALL SELECT 'navisha_note_users', count(*) FROM navisha_note_users`)

	run(ctx, conn, "== 15. ORDERS BY DAY (all, for peak) ==",
		`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*) AS cnt
		 FROM orders GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)
}

// inspectSQLite prints a human-readable "dashboard" of a SQLite DB — table
// sizes, row counts, running sessions, recent orders/trades, activity by day —
// so you can see what is happening on the VPS without a web console.
func inspectSQLite(path string) {
	fi, err := os.Stat(path)
	if err != nil {
		fmt.Println("stat ERROR:", err)
		return
	}
	db, err := sqlx.Open("sqlite", "file:"+path+"?_pragma=busy_timeout(5000)")
	if err != nil {
		fmt.Println("open ERROR:", err)
		return
	}
	defer db.Close()

	fmt.Printf("== SQLITE FILE ==\n  %s  (%.1f KB, modified %s)\n", path, float64(fi.Size())/1024, fi.ModTime().Format("2006-01-02 15:04:05"))
	if _, err := os.Stat(path + "-wal"); err == nil {
		if wfi, err := os.Stat(path + "-wal"); err == nil {
			fmt.Printf("  WAL file present (%.1f KB) — DB is open by a running process\n", float64(wfi.Size())/1024)
		}
	}

	var tables []string
	if err := db.Select(&tables, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"); err != nil {
		fmt.Println("list tables ERROR:", err)
		return
	}
	fmt.Println("\n== TABLE ROW COUNTS ==")
	for _, t := range tables {
		var n int
		if err := db.Get(&n, fmt.Sprintf("SELECT COUNT(*) FROM %q", t)); err != nil {
			fmt.Printf("  %-20s ERROR %v\n", t, err)
			continue
		}
		fmt.Printf("  %-20s %d\n", t, n)
	}

	runSQLite(db, "== RUNNING SESSIONS ==", `SELECT id, name, strategy, mode, symbol, status, started_at FROM sessions WHERE status='running' ORDER BY id`)
	runSQLite(db, "== ALL SESSIONS (last 15) ==", `SELECT id, name, strategy, mode, symbol, status, started_at, stopped_at FROM sessions ORDER BY id DESC LIMIT 15`)
	runSQLite(db, "== RECENT ORDERS (last 15) ==", `SELECT id, session_id, symbol, side, status, price, quantity, executed_qty, created_at FROM orders ORDER BY id DESC LIMIT 15`)
	runSQLite(db, "== RECENT TRADES (last 10) ==", `SELECT id, session_id, symbol, side, price, quantity, pnl, traded_at FROM trades ORDER BY id DESC LIMIT 10`)
	runSQLite(db, "== ORDERS BY DAY (last 14) ==", `SELECT substr(created_at,1,10) AS day, count(*) AS cnt FROM orders GROUP BY day ORDER BY day DESC LIMIT 14`)
	runSQLite(db, "== ORDERS BY STATUS ==", `SELECT status, count(*) AS cnt FROM orders GROUP BY status ORDER BY cnt DESC`)
	runSQLite(db, "== ORDERS BY SESSION (top 10) ==", `SELECT session_id, count(*) AS cnt FROM orders GROUP BY session_id ORDER BY cnt DESC LIMIT 10`)
	runSQLite(db, "== INDEXES ==", `SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name`)
}

// runSQLite prints a simple tab-separated table from a sqlx query.
func runSQLite(db *sqlx.DB, title, query string) {
	fmt.Printf("\n%s\n", title)
	rows, err := db.Queryx(query)
	if err != nil {
		fmt.Println("  ERROR:", err)
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		fmt.Println("  ERROR:", err)
		return
	}
	fmt.Println("  | " + strings.Join(cols, " | ") + " |")
	for rows.Next() {
		vals, err := rows.SliceScan()
		if err != nil {
			fmt.Println("  row error:", err)
			return
		}
		parts := make([]string, len(vals))
		for i, v := range vals {
			switch t := v.(type) {
			case time.Time:
				parts[i] = t.Format("2006-01-02 15:04:05")
			case []byte:
				parts[i] = string(t)
			case nil:
				parts[i] = "NULL"
			default:
				parts[i] = fmt.Sprintf("%v", t)
			}
		}
		fmt.Println("  | " + strings.Join(parts, " | ") + " |")
	}
}

// backupSQLite creates a consistent snapshot of a live SQLite file using
// VACUUM INTO (safe while the app is writing; no downtime).
func backupSQLite(path, out string) {
	db, err := sqlx.Open("sqlite", "file:"+path)
	if err != nil {
		fmt.Println("open ERROR:", err)
		return
	}
	defer db.Close()

	quoted := "'" + strings.ReplaceAll(out, "'", "''") + "'"
	if _, err := db.Exec("VACUUM INTO " + quoted); err != nil {
		fmt.Println("VACUUM INTO ERROR:", err)
		return
	}
	fmt.Println("BACKUP OK ->", out)
}

// smokeSQLite opens a SQLite file using the app's real NewDB (driver selection,
// WAL pragmas, pool) and Migrate, then exercises repository calls to prove the
// migrated file is usable by the application.
func smokeSQLite(path string) {
	cfg := &config.Config{DBDriver: "sqlite", DBPath: path}
	db, err := repository.NewDB(cfg)
	if err != nil {
		fmt.Println("NewDB ERROR:", err)
		return
	}
	defer db.Close()

	if err := repository.Migrate(db); err != nil {
		fmt.Println("Migrate ERROR:", err)
		return
	}

	sr := repository.NewSessionRepo(db)
	running, err := sr.ListRunning(context.Background())
	if err != nil {
		fmt.Println("ListRunning ERROR:", err)
		return
	}
	fmt.Printf("smoke: %d running sessions (Migrate idempotent OK)\n", len(running))
	for _, s := range running {
		fmt.Printf("  session %d %q %s/%s status=%s created=%s\n",
			s.ID, s.Name, s.Strategy, s.Mode, s.Status, s.CreatedAt.Format(time.RFC3339))
	}

	var orders, trades int
	_ = db.Get(&orders, "SELECT COUNT(*) FROM orders")
	_ = db.Get(&trades, "SELECT COUNT(*) FROM trades")
	fmt.Printf("smoke: orders=%d trades=%d\n", orders, trades)
	fmt.Println("SMOKE OK ->", path)
}

// migrateNeonToSQLite creates the SQLite schema via repository.Migrate and
// copies every app table from the source Neon connection into the target file.
func migrateNeonToSQLite(ctx context.Context, src *pgx.Conn, path string) error {
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	dst, err := sqlx.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	defer dst.Close()

	if err := repository.Migrate(dst); err != nil {
		return fmt.Errorf("create schema: %w", err)
	}

	tables := []string{"users", "api_keys", "sessions", "orders", "trades", "strategy_signals", "candles"}
	for _, t := range tables {
		if err := copyTable(ctx, src, dst, t); err != nil {
			return err
		}
	}

	// Verify round-trip reads, including a timestamp scan.
	var users, sessions, orders, trades int
	if err := dst.Get(&users, "SELECT COUNT(*) FROM users"); err != nil {
		return fmt.Errorf("verify users: %w", err)
	}
	_ = dst.Get(&sessions, "SELECT COUNT(*) FROM sessions")
	_ = dst.Get(&orders, "SELECT COUNT(*) FROM orders")
	_ = dst.Get(&trades, "SELECT COUNT(*) FROM trades")
	fmt.Printf("verify -> users=%d sessions=%d orders=%d trades=%d\n", users, sessions, orders, trades)

	var created time.Time
	if err := dst.Get(&created, "SELECT created_at FROM sessions ORDER BY id LIMIT 1"); err != nil {
		fmt.Println("WARN: time scan from sessions:", err)
	} else {
		fmt.Println("verify time scan OK:", created.Format(time.RFC3339))
	}
	return nil
}

// copyTable copies all rows of a table from the source connection into the
// target SQLite database using explicit column names (order-independent).
func copyTable(ctx context.Context, src *pgx.Conn, dst *sqlx.DB, table string) error {
	rows, err := src.Query(ctx, "SELECT * FROM "+table)
	if err != nil {
		return fmt.Errorf("source %s: %w", table, err)
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	cols := make([]string, len(fields))
	for i, f := range fields {
		cols[i] = string(f.Name)
	}
	insert := "INSERT INTO " + table + " (" + strings.Join(cols, ",") + ") VALUES (" +
		strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",") + ")"

	var batch [][]any
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return err
		}
		batch = append(batch, vals)
	}
	if rows.Err() != nil {
		return rows.Err()
	}

	tx, err := dst.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, vals := range batch {
		conv := make([]any, len(vals))
		for i, v := range vals {
			conv[i] = convertValue(v)
		}
		if _, err := tx.Exec(insert, conv...); err != nil {
			return fmt.Errorf("insert %s: %w", table, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	fmt.Printf("copied %s: %d rows\n", table, len(batch))
	return nil
}

// convertValue normalizes pgx value types for the SQLite driver.
func convertValue(v any) any {
	switch t := v.(type) {
	case time.Time:
		// SQLite's native datetime format (same as CURRENT_TIMESTAMP) —
		// known to round-trip via the app's own code paths.
		return t.UTC().Format("2006-01-02 15:04:05")
	case bool:
		if t {
			return 1
		}
		return 0
	case []byte:
		return string(t)
	default:
		return v
	}
}

// applyIndexes creates the missing indexes for the hot query paths.
// Idempotent (IF NOT EXISTS). Only touches the trading tables.
func applyIndexes(ctx context.Context, conn *pgx.Conn) {
	stmts := []string{
		`CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_session_side_status ON orders(session_id, side, status)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_dca_tpsl ON orders(session_id, symbol, side, status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_strategy_signals_session ON strategy_signals(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_strategy_signals_status ON strategy_signals(validation_status)`,
		`CREATE INDEX IF NOT EXISTS idx_trades_session ON trades(session_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`,
	}
	for _, s := range stmts {
		if _, err := conn.Exec(ctx, s); err != nil {
			fmt.Println("ERROR:", err)
			fmt.Println("  stmt:", s)
			continue
		}
		fmt.Println("OK:", s)
	}

	fmt.Println("\n== INDEXES AFTER ==")
	run(ctx, conn, "", `SELECT tablename, indexname FROM pg_indexes
		WHERE schemaname='public' AND (tablename IN ('orders','sessions','strategy_signals','trades'))
		ORDER BY tablename, indexname`)
}

func run(ctx context.Context, conn *pgx.Conn, title, query string) {
	fmt.Printf("\n%s\n", title)
	rows, err := conn.Query(ctx, query)
	if err != nil {
		fmt.Println("  ERROR:", err)
		return
	}
	defer rows.Close()

	cols := rows.FieldDescriptions()
	names := make([]string, len(cols))
	for i, c := range cols {
		names[i] = string(c.Name)
	}
	fmt.Println("  | " + strings.Join(names, " | ") + " |")
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			fmt.Println("  row error:", err)
			return
		}
		parts := make([]string, len(vals))
		for i, v := range vals {
			parts[i] = fmt.Sprintf("%v", v)
		}
		fmt.Println("  | " + strings.Join(parts, " | ") + " |")
	}
}

func stripParam(dsn, param string) string {
	parts := strings.SplitN(dsn, "?", 2)
	if len(parts) < 2 {
		return dsn
	}
	qs := parts[1]
	seg := make([]string, 0)
	for _, kv := range strings.Split(qs, "&") {
		if strings.HasPrefix(kv, param+"=") {
			continue
		}
		seg = append(seg, kv)
	}
	if len(seg) == 0 {
		return parts[0]
	}
	return parts[0] + "?" + strings.Join(seg, "&")
}
