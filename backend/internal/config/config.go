package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

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
	AllowedOrigins   []string

	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
	AllowedEmails      map[string]bool

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
	// Overload (not Load) so .env always wins over any pre-set shell
	// env var — e.g. an empty TOKO_API_KEY exported in the shell
	// would otherwise shadow the real value from .env.
	if err := godotenv.Overload(); err != nil && !os.IsNotExist(err) {
		slog.Warn("godotenv", "error", err)
	}

	origins := getEnv("ALLOWED_ORIGINS", "http://localhost:3100,http://localhost:3000")
	allowedOrigins := strings.Split(origins, ",")

	return &Config{
		Port:             getEnv("PORT", "8100"),
		JWTSecret:        getEnv("JWT_SECRET", "change-me"),
		TokenAPIKey:      os.Getenv("TOKO_API_KEY"),
		TokenSecretKey:   os.Getenv("TOKO_SECRET_KEY"),
		TelegramBotToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramChatID:   os.Getenv("TELEGRAM_CHAT_ID"),
		TokenExpiryHours: getEnvInt("TOKEN_EXPIRY_HOURS", 24),
		AllowedOrigins:   allowedOrigins,

		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURL:  getEnv("GOOGLE_REDIRECT_URL", "http://localhost:8100/v1/auth/google/callback"),
		AllowedEmails:      parseEmailWhitelist(os.Getenv("ALLOWED_EMAILS")),

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

func parseEmailWhitelist(raw string) map[string]bool {
	m := map[string]bool{}
	for _, e := range strings.Split(raw, ",") {
		e = strings.TrimSpace(e)
		if e != "" {
			m[e] = true
		}
	}
	return m
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
		slog.Warn("config: invalid int value", "key", key, "value", v, "fallback", fallback)
	}
	return fallback
}