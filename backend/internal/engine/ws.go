package engine

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHub struct {
	mu      sync.RWMutex
	clients map[int64]map[*websocket.Conn]bool
}

func NewWSHub() *WSHub {
	return &WSHub{clients: make(map[int64]map[*websocket.Conn]bool)}
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
