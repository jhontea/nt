package service

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/user/nt/internal/repository"
)

type AuthService struct {
	userRepo      repository.UserRepository
	jwtSecret     string
	tokenExpiry   time.Duration
	allowedEmails map[string]bool
}

func NewAuthService(userRepo repository.UserRepository, jwtSecret string, tokenExpiryHours int, allowedEmails map[string]bool) *AuthService {
	hours := tokenExpiryHours
	if hours < 1 {
		hours = 24
	}
	return &AuthService{
		userRepo:      userRepo,
		jwtSecret:     jwtSecret,
		tokenExpiry:   time.Duration(hours) * time.Hour,
		allowedEmails: allowedEmails,
	}
}

// LoginWithGoogle finds or creates a user by Google email, enforcing the whitelist.
func (s *AuthService) LoginWithGoogle(ctx context.Context, email, name string) (string, error) {
	if len(s.allowedEmails) > 0 && !s.allowedEmails[email] {
		return "", errors.New("akses ditolak: email tidak diizinkan")
	}
	user, err := s.userRepo.FindOrCreateByGoogle(ctx, email, name)
	if err != nil {
		return "", err
	}
	return s.generateToken(user.ID)
}

func (s *AuthService) generateToken(userID int64) (string, error) {
	claims := jwt.MapClaims{
		"sub": strconv.FormatInt(userID, 10),
		"exp": time.Now().Add(s.tokenExpiry).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}
