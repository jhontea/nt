package service

import (
	"context"
	"errors"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/user/nt/internal/model"
	"github.com/user/nt/internal/repository/mocks"
	"go.uber.org/mock/gomock"
	"golang.org/x/crypto/bcrypt"
)

func TestAuthService_Register_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockUserRepo := mocks.NewMockUserRepository(ctrl)
	mockUserRepo.EXPECT().Create(gomock.Any(), "alice", gomock.Any()).
		Return(&model.User{ID: 1, Username: "alice"}, nil)

	svc := NewAuthService(mockUserRepo, "test-secret")
	token, err := svc.Register(context.Background(), "alice", "strongpass")
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestAuthService_Register_Duplicate(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockUserRepo := mocks.NewMockUserRepository(ctrl)
	mockUserRepo.EXPECT().Create(gomock.Any(), "alice", gomock.Any()).
		Return(nil, errors.New("UNIQUE constraint failed"))

	svc := NewAuthService(mockUserRepo, "test-secret")
	_, err := svc.Register(context.Background(), "alice", "strongpass")
	if err == nil {
		t.Fatal("expected error for duplicate username")
	}
}

func TestAuthService_Login_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	hash, _ := bcrypt.GenerateFromPassword([]byte("mypass"), 10)
	mockUserRepo := mocks.NewMockUserRepository(ctrl)
	mockUserRepo.EXPECT().FindByUsername(gomock.Any(), "alice").
		Return(&model.User{ID: 1, Username: "alice", PasswordHash: string(hash)}, nil)

	svc := NewAuthService(mockUserRepo, "test-secret")
	token, err := svc.Login(context.Background(), "alice", "mypass")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
}

func TestAuthService_Login_WrongPassword(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	hash, _ := bcrypt.GenerateFromPassword([]byte("realpass"), 10)
	mockUserRepo := mocks.NewMockUserRepository(ctrl)
	mockUserRepo.EXPECT().FindByUsername(gomock.Any(), "alice").
		Return(&model.User{ID: 1, Username: "alice", PasswordHash: string(hash)}, nil)

	svc := NewAuthService(mockUserRepo, "test-secret")
	_, err := svc.Login(context.Background(), "alice", "wrongpass")
	if err == nil {
		t.Fatal("expected error for wrong password")
	}
}

func TestAuthService_Token_HasCorrectClaims(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockUserRepo := mocks.NewMockUserRepository(ctrl)
	mockUserRepo.EXPECT().Create(gomock.Any(), "bob", gomock.Any()).
		Return(&model.User{ID: 42, Username: "bob"}, nil)

	svc := NewAuthService(mockUserRepo, "my-secret")
	tokenStr, err := svc.Register(context.Background(), "bob", "pass")
	if err != nil {
		t.Fatalf("Register failed: %v", err)
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
