package config

import "os"

type Config struct {
	Port           string
	DatabasePath   string
	JWTSecret      string
	TokenAPIKey    string
	TokenSecretKey string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabasePath:   getEnv("DATABASE_PATH", "./data/trading.db"),
		JWTSecret:      getEnv("JWT_SECRET", "change-me"),
		TokenAPIKey:    os.Getenv("TOKO_API_KEY"),
		TokenSecretKey: os.Getenv("TOKO_SECRET_KEY"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
