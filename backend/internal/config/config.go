package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port             string
	JWTSecret        string
	TokenAPIKey      string
	TokenSecretKey   string
	TelegramBotToken string
	TelegramChatID   string
	TokenExpiryHours int

	DBHost           string
	DBPort           int
	DBName           string
	DBUser           string
	DBPassword       string
	DBSSLMode        string
	DBMaxConnections int
	DBMaxIdleConns   int
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		Port:             getEnv("PORT", "8100"),
		JWTSecret:        getEnv("JWT_SECRET", "change-me"),
		TokenAPIKey:      os.Getenv("TOKO_API_KEY"),
		TokenSecretKey:   os.Getenv("TOKO_SECRET_KEY"),
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramChatID:   os.Getenv("TELEGRAM_CHAT_ID"),
		TokenExpiryHours: getEnvInt("TOKEN_EXPIRY_HOURS", 24),

		DBHost:           getEnv("DB_HOST", "localhost"),
		DBPort:           getEnvInt("DB_PORT", 5432),
		DBName:           getEnv("DB_NAME", "navisha_trade"),
		DBUser:           getEnv("DB_USER", "postgres"),
		DBPassword:       os.Getenv("DB_PASSWORD"),
		DBSSLMode:        getEnv("DB_SSLMODE", "disable"),
		DBMaxConnections: getEnvInt("DB_MAX_CONNECTIONS", 25),
		DBMaxIdleConns:   getEnvInt("DB_MAX_IDLE_CONNECTIONS", 5),
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf("host=%s port=%d dbname=%s user=%s password=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBName, c.DBUser, c.DBPassword, c.DBSSLMode)
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