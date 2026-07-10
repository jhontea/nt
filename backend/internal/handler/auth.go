package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/user/nt/internal/service"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

type AuthHandler struct {
	svc         *service.AuthService
	oauthCfg    *oauth2.Config
	frontendURL string
}

func NewAuthHandler(svc *service.AuthService, clientID, clientSecret, redirectURL, frontendURL string) *AuthHandler {
	cfg := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
	return &AuthHandler{svc: svc, oauthCfg: cfg, frontendURL: frontendURL}
}

// GoogleLogin redirects the user to Google's OAuth consent page.
func (h *AuthHandler) GoogleLogin(c echo.Context) error {
	// ponytail: static state string fine for single-server dev use; add CSRF state token when needed
	url := h.oauthCfg.AuthCodeURL("state", oauth2.AccessTypeOnline)
	return c.Redirect(http.StatusTemporaryRedirect, url)
}

// GoogleCallback handles the OAuth callback, exchanges code for token, then issues JWT.
func (h *AuthHandler) GoogleCallback(c echo.Context) error {
	code := c.QueryParam("code")
	if code == "" {
		return c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=no_code")
	}

	ctx := c.Request().Context()
	if ctx == nil {
		ctx = context.Background()
	}

	oauthToken, err := h.oauthCfg.Exchange(ctx, code)
	if err != nil {
		return c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=exchange_failed")
	}

	userInfo, err := fetchGoogleUserInfo(ctx, h.oauthCfg, oauthToken)
	if err != nil {
		return c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=userinfo_failed")
	}

	jwt, err := h.svc.LoginWithGoogle(ctx, userInfo.Email, userInfo.Name)
	if err != nil {
		return c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=not_allowed")
	}

	return c.Redirect(http.StatusTemporaryRedirect, fmt.Sprintf("%s/auth/callback?token=%s", h.frontendURL, jwt))
}

type googleUserInfo struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

func fetchGoogleUserInfo(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) (*googleUserInfo, error) {
	client := cfg.Client(ctx, token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo status %d", resp.StatusCode)
	}
	var info googleUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	return &info, nil
}
