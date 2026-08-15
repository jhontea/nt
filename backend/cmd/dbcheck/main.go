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
)

func main() {
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
