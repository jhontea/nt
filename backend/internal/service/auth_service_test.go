package service

import (
	"context"
	"errors"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository/mocks"
	"go.uber.org/mock/gomock"
)

func TestAuthService_LoginWithGoogle_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRepo := mocks.NewMockUserRepository(ctrl)
	mockRepo.EXPECT().
		FindOrCreateByGoogle(gomock.Any(), "hafizhipb49@gmail.com", "Hafizh").
		Return(&model.User{ID: 1, Username: "Hafizh", Email: "hafizhipb49@gmail.com"}, nil)

	svc := NewAuthService(mockRepo, "test-secret", 24, map[string]bool{"hafizhipb49@gmail.com": true})
	token, err := svc.LoginWithGoogle(context.Background(), "hafizhipb49@gmail.com", "Hafizh")
	if err != nil {
		t.Fatalf("expected success, got: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestAuthService_LoginWithGoogle_NotAllowed(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRepo := mocks.NewMockUserRepository(ctrl)
	// FindOrCreateByGoogle should NOT be called for blocked emails
	svc := NewAuthService(mockRepo, "test-secret", 24, map[string]bool{"hafizhipb49@gmail.com": true})
	_, err := svc.LoginWithGoogle(context.Background(), "other@gmail.com", "Other")
	if err == nil {
		t.Fatal("expected error for non-whitelisted email")
	}
}

func TestAuthService_LoginWithGoogle_RepoError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRepo := mocks.NewMockUserRepository(ctrl)
	mockRepo.EXPECT().
		FindOrCreateByGoogle(gomock.Any(), "hafizhipb49@gmail.com", "Hafizh").
		Return(nil, errors.New("db error"))

	svc := NewAuthService(mockRepo, "test-secret", 24, map[string]bool{"hafizhipb49@gmail.com": true})
	_, err := svc.LoginWithGoogle(context.Background(), "hafizhipb49@gmail.com", "Hafizh")
	if err == nil {
		t.Fatal("expected error from repo")
	}
}

func TestAuthService_Token_HasCorrectClaims(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRepo := mocks.NewMockUserRepository(ctrl)
	mockRepo.EXPECT().
		FindOrCreateByGoogle(gomock.Any(), "hafizhipb49@gmail.com", "Hafizh").
		Return(&model.User{ID: 42, Username: "Hafizh", Email: "hafizhipb49@gmail.com"}, nil)

	svc := NewAuthService(mockRepo, "my-secret", 24, map[string]bool{"hafizhipb49@gmail.com": true})
	tokenStr, err := svc.LoginWithGoogle(context.Background(), "hafizhipb49@gmail.com", "Hafizh")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	claims := &jwt.RegisteredClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte("my-secret"), nil
	})
	if err != nil {
		t.Fatalf("token parse failed: %v", err)
	}
	if !token.Valid {
		t.Fatal("token should be valid")
	}
	if claims.Subject != "42" {
		t.Errorf("expected sub=42, got %s", claims.Subject)
	}
}
