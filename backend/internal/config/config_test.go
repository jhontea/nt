package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	// Save and clear env
	old := saveEnv()
	defer restoreEnv(old)

	cfg := Load()

	if cfg.Port != "8100" {
		t.Errorf("expected default port 8100, got %s", cfg.Port)
	}
	if cfg.DatabasePath != "./data/trading.db" {
		t.Errorf("expected default db path, got %s", cfg.DatabasePath)
	}
	if cfg.JWTSecret != "change-me" {
		t.Errorf("expected default jwt secret, got %s", cfg.JWTSecret)
	}
	if cfg.TokenExpiryHours != 24 {
		t.Errorf("expected default token expiry 24h, got %d", cfg.TokenExpiryHours)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	old := saveEnv()
	defer restoreEnv(old)

	os.Setenv("PORT", "9090")
	os.Setenv("JWT_SECRET", "my-secret")
	os.Setenv("TOKO_API_KEY", "api123")
	os.Setenv("DB_DRIVER", "postgres")
	os.Setenv("DATABASE_DSN", "postgres://user:pass@localhost/db")
	os.Setenv("TOKEN_EXPIRY_HOURS", "72")

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
	if cfg.DatabaseDriver != "postgres" {
		t.Errorf("expected postgres driver, got '%s'", cfg.DatabaseDriver)
	}
	if cfg.DatabaseDSN != "postgres://user:pass@localhost/db" {
		t.Errorf("expected dsn, got '%s'", cfg.DatabaseDSN)
	}
	if cfg.TokenExpiryHours != 72 {
		t.Errorf("expected token expiry 72h, got %d", cfg.TokenExpiryHours)
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
	vars := []string{"PORT", "JWT_SECRET", "TOKO_API_KEY", "TOKO_SECRET_KEY",
		"TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "DB_DRIVER", "DATABASE_DSN", "DATABASE_PATH", "TOKEN_EXPIRY_HOURS"}
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
