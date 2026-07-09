package engine

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

const (
	wsPingInterval = 30 * time.Second
	wsWriteTimeout = 10 * time.Second
	wsReadTimeout  = 60 * time.Second
)

// wsConn wraps a websocket.Conn with a per-connection write mutex.
// websocket.Conn.WriteMessage is not safe for concurrent use.
type wsConn struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func (c *wsConn) writeJSON(v any) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
	return c.conn.WriteMessage(websocket.TextMessage, data)
}

func (c *wsConn) writePing() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
	return c.conn.WriteMessage(websocket.PingMessage, nil)
}

func (c *wsConn) close() {
	c.conn.Close()
}

type WSHub struct {
	mu             sync.RWMutex
	clients        map[int64]map[*wsConn]bool
	jwtSecret      string
	allowedOrigins map[string]bool
}

func NewWSHub(jwtSecret string) *WSHub {
	return &WSHub{
		clients:        make(map[int64]map[*wsConn]bool),
		jwtSecret:      jwtSecret,
		allowedOrigins: make(map[string]bool),
	}
}

// SetAllowedOrigins configures which origins are permitted for WebSocket upgrades.
func (h *WSHub) SetAllowedOrigins(origins []string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.allowedOrigins = make(map[string]bool, len(origins))
	for _, o := range origins {
		h.allowedOrigins[o] = true
	}
}

func (h *WSHub) upgrader() websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // direct connection (curl, etc.)
			}
			h.mu.RLock()
			defer h.mu.RUnlock()
			return h.allowedOrigins[origin]
		},
	}
}

func (h *WSHub) register(sessionID int64, c *wsConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[sessionID] == nil {
		h.clients[sessionID] = make(map[*wsConn]bool)
	}
	h.clients[sessionID][c] = true
}

func (h *WSHub) unregister(sessionID int64, c *wsConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[sessionID] != nil {
		delete(h.clients[sessionID], c)
		if len(h.clients[sessionID]) == 0 {
			delete(h.clients, sessionID)
		}
	}
}

func (h *WSHub) Broadcast(sessionID int64, msg any) {
	h.mu.RLock()
	conns := make([]*wsConn, 0, len(h.clients[sessionID]))
	for c := range h.clients[sessionID] {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		if err := c.writeJSON(msg); err != nil {
			c.close()
			h.unregister(sessionID, c)
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

	sessionID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || sessionID <= 0 {
		return c.String(http.StatusBadRequest, "invalid session id")
	}

	up := h.upgrader()
	rawConn, err := up.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	wc := &wsConn{conn: rawConn}
	h.register(sessionID, wc)
	defer func() {
		h.unregister(sessionID, wc)
		wc.close()
	}()

	// Pong handler resets read deadline
	rawConn.SetPongHandler(func(string) error {
		rawConn.SetReadDeadline(time.Now().Add(wsReadTimeout))
		return nil
	})
	rawConn.SetReadDeadline(time.Now().Add(wsReadTimeout))

	slog.Debug("ws connected", "session", sessionID)

	// Ping ticker to detect stale connections
	ping := time.NewTicker(wsPingInterval)
	defer ping.Stop()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := rawConn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return nil
		case <-ping.C:
			if err := wc.writePing(); err != nil {
				return nil
			}
		}
	}
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

type WSPaperAlert struct {
	Type      string  `json:"type"`
	SessionID int64   `json:"session_id"`
	Reason    string  `json:"reason"`
	Needed    float64 `json:"needed"`
	Available float64 `json:"available"`
}
