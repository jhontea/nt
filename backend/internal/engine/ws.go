package engine

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"sync"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

type WSHub struct {
	mu        sync.RWMutex
	clients   map[int64]map[*websocket.Conn]bool
	jwtSecret string
}

func NewWSHub(jwtSecret string) *WSHub {
	return &WSHub{
		clients:   make(map[int64]map[*websocket.Conn]bool),
		jwtSecret: jwtSecret,
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Allow no origin (direct WS), localhost, and common dev origins
		return origin == "" || origin == "http://localhost:3100" || origin == "http://localhost:3000"
	},
}

func (h *WSHub) Register(sessionID int64, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[sessionID] == nil {
		h.clients[sessionID] = make(map[*websocket.Conn]bool)
	}
	h.clients[sessionID][conn] = true
}

func (h *WSHub) Unregister(sessionID int64, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[sessionID] != nil {
		delete(h.clients[sessionID], conn)
		if len(h.clients[sessionID]) == 0 {
			delete(h.clients, sessionID)
		}
	}
}

func (h *WSHub) Broadcast(sessionID int64, msg any) {
	data, _ := json.Marshal(msg)
	h.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(h.clients[sessionID]))
	for conn := range h.clients[sessionID] {
		conns = append(conns, conn)
	}
	h.mu.RUnlock()

	for _, conn := range conns {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			conn.Close()
			h.Unregister(sessionID, conn)
		}
	}
}

func (h *WSHub) HandleWS(c echo.Context) error {
	// JWT auth via query param
	tokenStr := c.QueryParam("token")
	if tokenStr == "" {
		return c.String(http.StatusUnauthorized, "missing token")
	}
	claims := &jwt.RegisteredClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return c.String(http.StatusUnauthorized, "invalid token")
	}
	if _, err := strconv.ParseInt(claims.Subject, 10, 64); err != nil {
		return c.String(http.StatusUnauthorized, "invalid subject")
	}

	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	h.Register(id, conn)
	defer func() {
		h.Unregister(id, conn)
		conn.Close()
	}()
	slog.Debug("ws connected", "session", id)
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
	return nil
}

type WSSignal struct {
	Type      string `json:"type"`
	SessionID int64  `json:"session_id"`
	Signal
}

type WSUpdate struct {
	Type      string `json:"type"`
	SessionID int64  `json:"session_id"`
	PnL       any    `json:"pnl,omitempty"`
}
