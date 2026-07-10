package repository

//go:generate go run go.uber.org/mock/mockgen -source=$GOFILE -destination=mocks/mock.go -package=mocks

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/user/nt/internal/model"
)

type UserRepository interface {
	Create(ctx context.Context, username, passwordHash string) (*model.User, error)
	FindByID(ctx context.Context, id int64) (*model.User, error)
	FindByUsername(ctx context.Context, username string) (*model.User, error)
	FindByEmail(ctx context.Context, email string) (*model.User, error)
	FindOrCreateByGoogle(ctx context.Context, email, name string) (*model.User, error)
}

type UserRepo struct {
	db *sqlx.DB
}

func NewUserRepo(db *sqlx.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(ctx context.Context, username, passwordHash string) (*model.User, error) {
	var id int64
	err := r.db.GetContext(ctx, &id,
		r.db.Rebind("INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id"),
		username, passwordHash,
	)
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

func (r *UserRepo) FindByID(ctx context.Context, id int64) (*model.User, error) {
	var user model.User
	err := r.db.GetContext(ctx, &user, r.db.Rebind("SELECT * FROM users WHERE id = ?"), id)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) FindByUsername(ctx context.Context, username string) (*model.User, error) {
	var user model.User
	err := r.db.GetContext(ctx, &user, r.db.Rebind("SELECT * FROM users WHERE username = ?"), username)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	var user model.User
	err := r.db.GetContext(ctx, &user, r.db.Rebind("SELECT * FROM users WHERE email = ?"), email)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) FindOrCreateByGoogle(ctx context.Context, email, name string) (*model.User, error) {
	user, err := r.FindByEmail(ctx, email)
	if err == nil {
		return user, nil
	}
	// not found — create
	var id int64
	err = r.db.GetContext(ctx, &id,
		r.db.Rebind("INSERT INTO users (username, email, password_hash) VALUES (?, ?, '') RETURNING id"),
		name, email,
	)
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}

var _ UserRepository = (*UserRepo)(nil)