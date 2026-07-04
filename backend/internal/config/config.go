package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port             string
	DatabasePath     string
	DatabaseDriver   string
	DatabaseDSN      string
	JWTSecret        string
	TokenAPIKey      string
	TokenSecretKey   string
	TelegramBotToken string
	TelegramChatID   string
	TokenExpiryHours int
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:             getEnv("PORT", "8100"),
		DatabasePath:     getEnv("DATABASE_PATH", "./data/trading.db"),
		DatabaseDriver:   os.Getenv("DB_DRIVER"),
		DatabaseDSN:      os.Getenv("DATABASE_DSN"),
		JWTSecret:        getEnv("JWT_SECRET", "change-me"),
		TokenAPIKey:      os.Getenv("TOKO_API_KEY"),
		TokenSecretKey:   os.Getenv("TOKO_SECRET_KEY"),
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramChatID:   os.Getenv("TELEGRAM_CHAT_ID"),
		TokenExpiryHours: getEnvInt("TOKEN_EXPIRY_HOURS", 24),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}
