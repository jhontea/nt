package config

import (
    "os"
    "github.com/joho/godotenv"
)

type Config struct {
	Port             string
	DatabasePath     string
	JWTSecret        string
	TokenAPIKey      string
	TokenSecretKey   string
	TelegramBotToken string
	TelegramChatID   string
}

func Load() *Config {
	godotenv.Load()
	return &Config{
		Port:             getEnv("PORT", "8100"),
		DatabasePath:     getEnv("DATABASE_PATH", "./data/trading.db"),
		JWTSecret:        getEnv("JWT_SECRET", "change-me"),
		TokenAPIKey:      os.Getenv("TOKO_API_KEY"),
		TokenSecretKey:   os.Getenv("TOKO_SECRET_KEY"),
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramChatID:   os.Getenv("TELEGRAM_CHAT_ID"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
