package service

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/user/nt/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo    repository.UserRepository
	jwtSecret   string
	tokenExpiry time.Duration
}

func NewAuthService(userRepo repository.UserRepository, jwtSecret string, tokenExpiryHours int) *AuthService {
	hours := tokenExpiryHours
	if hours < 1 {
		hours = 24
	}
	return &AuthService{userRepo: userRepo, jwtSecret: jwtSecret, tokenExpiry: time.Duration(hours) * time.Hour}
}

func (s *AuthService) Register(ctx context.Context, username, password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		return "", err
	}
	user, err := s.userRepo.Create(ctx, username, string(hash))
	if err != nil {
		return "", err
	}
	return s.generateToken(user.ID)
}

func (s *AuthService) Login(ctx context.Context, username, password string) (string, error) {
	user, err := s.userRepo.FindByUsername(ctx, username)
	if err != nil {
		return "", errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", errors.New("invalid credentials")
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
