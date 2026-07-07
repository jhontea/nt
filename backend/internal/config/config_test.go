package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	old := saveEnv()
	defer restoreEnv(old)

	cfg := Load()

	if cfg.Port != "8100" {
		t.Errorf("expected default port 8100, got %s", cfg.Port)
	}
	if cfg.JWTSecret != "change-me" {
		t.Errorf("expected default jwt secret, got %s", cfg.JWTSecret)
	}
	if cfg.TokenExpiryHours != 24 {
		t.Errorf("expected default token expiry 24h, got %d", cfg.TokenExpiryHours)
	}
	if cfg.DBHost != "localhost" {
		t.Errorf("expected default db host localhost, got %s", cfg.DBHost)
	}
	if cfg.DBPort != 5432 {
		t.Errorf("expected default db port 5432, got %d", cfg.DBPort)
	}
	if cfg.DBName != "navisha_trade" {
		t.Errorf("expected default db name navisha_trade, got %s", cfg.DBName)
	}
	if cfg.DBUser != "postgres" {
		t.Errorf("expected default db user postgres, got %s", cfg.DBUser)
	}
	if cfg.DBSSLMode != "disable" {
		t.Errorf("expected default sslmode disable, got %s", cfg.DBSSLMode)
	}
	if cfg.DBMaxConnections != 25 {
		t.Errorf("expected default max connections 25, got %d", cfg.DBMaxConnections)
	}
	if cfg.DBMaxIdleConns != 5 {
		t.Errorf("expected default max idle 5, got %d", cfg.DBMaxIdleConns)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	old := saveEnv()
	defer restoreEnv(old)

	os.Setenv("PORT", "9090")
	os.Setenv("JWT_SECRET", "my-secret")
	os.Setenv("TOKO_API_KEY", "api123")
	os.Setenv("TOKEN_EXPIRY_HOURS", "72")
	os.Setenv("DB_HOST", "db.example.com")
	os.Setenv("DB_PORT", "6543")
	os.Setenv("DB_NAME", "mydb")
	os.Setenv("DB_USER", "myuser")
	os.Setenv("DB_PASSWORD", "mypass")
	os.Setenv("DB_SSLMODE", "require")
	os.Setenv("DB_MAX_CONNECTIONS", "10")
	os.Setenv("DB_MAX_IDLE_CONNECTIONS", "2")

	cfg := Load()

	if cfg.Port != "9090" {
		t.Errorf("expected port 9090, got %s", cfg.Port)
	}
	if cfg.JWTSecret != "my-secret" {
		t.Errorf("expected jwt secret 'my-secret', got '%s'", cfg.JWTSecret)
	}
	if cfg.TokenAPIKey != "api123" {
		t.Errorf("expected api key 'api123', got '%s'", cfg.TokenAPIKey)
	}
	if cfg.TokenExpiryHours != 72 {
		t.Errorf("expected token expiry 72h, got %d", cfg.TokenExpiryHours)
	}
	if cfg.DBHost != "db.example.com" {
		t.Errorf("expected db host db.example.com, got %s", cfg.DBHost)
	}
	if cfg.DBPort != 6543 {
		t.Errorf("expected db port 6543, got %d", cfg.DBPort)
	}
	if cfg.DBName != "mydb" {
		t.Errorf("expected db name mydb, got %s", cfg.DBName)
	}
	if cfg.DBUser != "myuser" {
		t.Errorf("expected db user myuser, got %s", cfg.DBUser)
	}
	if cfg.DBPassword != "mypass" {
		t.Errorf("expected db password mypass, got %s", cfg.DBPassword)
	}
	if cfg.DBSSLMode != "require" {
		t.Errorf("expected sslmode require, got %s", cfg.DBSSLMode)
	}
	if cfg.DBMaxConnections != 10 {
		t.Errorf("expected max connections 10, got %d", cfg.DBMaxConnections)
	}
	if cfg.DBMaxIdleConns != 2 {
		t.Errorf("expected max idle 2, got %d", cfg.DBMaxIdleConns)
	}
}

func TestDSN(t *testing.T) {
	cfg := &Config{
		DBHost:     "localhost",
		DBPort:     5432,
		DBName:     "testdb",
		DBUser:     "user",
		DBPassword: "pass",
		DBSSLMode:  "disable",
	}
	dsn := cfg.DSN()
	expected := "host=localhost port=5432 dbname=testdb user=user password=pass sslmode=disable"
	if dsn != expected {
		t.Errorf("expected dsn %s, got %s", expected, dsn)
	}
}

func TestGetEnv_Fallback(t *testing.T) {
	result := getEnv("NONEXISTENT_VAR_12345", "fallback")
	if result != "fallback" {
		t.Errorf("expected 'fallback', got '%s'", result)
	}
}

func TestGetEnv_FromEnv(t *testing.T) {
	os.Setenv("TEST_GET_ENV", "actual")
	defer os.Unsetenv("TEST_GET_ENV")

	result := getEnv("TEST_GET_ENV", "fallback")
	if result != "actual" {
		t.Errorf("expected 'actual', got '%s'", result)
	}
}

func TestGetEnvInt_Default(t *testing.T) {
	os.Unsetenv("TEST_GET_ENV_INT")
	result := getEnvInt("TEST_GET_ENV_INT", 42)
	if result != 42 {
		t.Errorf("expected 42, got %d", result)
	}
}

func TestGetEnvInt_FromEnv(t *testing.T) {
	os.Setenv("TEST_GET_ENV_INT", "99")
	defer os.Unsetenv("TEST_GET_ENV_INT")
	result := getEnvInt("TEST_GET_ENV_INT", 42)
	if result != 99 {
		t.Errorf("expected 99, got %d", result)
	}
}

func TestGetEnvInt_Invalid(t *testing.T) {
	os.Setenv("TEST_GET_ENV_INT", "not-a-number")
	defer os.Unsetenv("TEST_GET_ENV_INT")
	result := getEnvInt("TEST_GET_ENV_INT", 42)
	if result != 42 {
		t.Errorf("expected fallback 42 for invalid input, got %d", result)
	}
}

func saveEnv() map[string]string {
	vars := []string{
		"PORT", "JWT_SECRET", "TOKO_API_KEY", "TOKO_SECRET_KEY",
		"TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TOKEN_EXPIRY_HOURS",
		"DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD",
		"DB_SSLMODE", "DB_MAX_CONNECTIONS", "DB_MAX_IDLE_CONNECTIONS",
	}
	old := make(map[string]string, len(vars))
	for _, v := range vars {
		old[v] = os.Getenv(v)
		os.Unsetenv(v)
	}
	return old
}

func restoreEnv(old map[string]string) {
	for k, v := range old {
		if v != "" {
			os.Setenv(k, v)
		} else {
			os.Unsetenv(k)
		}
	}
}