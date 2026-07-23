package query

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/gorilla/websocket"
)

// TerminalCommand is relayed down to Electron's terminal-relay so it can run
// the command inside the user's real, visible PTY instead of a detached
// subprocess — the agent's commands appear exactly as if the user had typed
// them into the same shell.
type TerminalCommand struct {
	ID      string `json:"id"`
	Command string `json:"command"`
	Cwd     string `json:"cwd,omitempty"`
}

// TerminalResult is Electron's reply once its shell-integration markers
// confirm the relayed command finished.
type TerminalResult struct {
	ID       string `json:"id"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Cwd      string `json:"cwd"`
	Error    string `json:"error,omitempty"`
}

// relayConn pairs a WS connection with a write mutex — gorilla/websocket
// connections support only one concurrent writer, and concurrent bash calls
// in the same session (e.g. sub-agents) can both target it.
type relayConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

// TerminalRelay bridges the engine's bash-tool execution to Electron's real,
// visible PTY over a per-session WebSocket. Mirrors the mutex+map convention
// established by PermissionBroker/PromptBroker in broker.go.
type TerminalRelay struct {
	mu      sync.Mutex
	conns   map[string]*relayConn          // sessionID -> Electron's relay connection
	pending map[string]chan TerminalResult // command ID -> caller awaiting the result
	nextID  uint64
}

func NewTerminalRelay() *TerminalRelay {
	return &TerminalRelay{
		conns:   make(map[string]*relayConn),
		pending: make(map[string]chan TerminalResult),
	}
}

// Register attaches sessionID's active Electron relay connection. A
// reconnect supersedes any previous connection for the same session rather
// than being rejected.
func (r *TerminalRelay) Register(sessionID string, conn *websocket.Conn) *relayConn {
	rc := &relayConn{conn: conn}
	r.mu.Lock()
	r.conns[sessionID] = rc
	r.mu.Unlock()
	return rc
}

// Unregister detaches sessionID's connection iff it still matches rc — a
// late-arriving unregister from a superseded connection must not evict a
// newer one that already took its place.
func (r *TerminalRelay) Unregister(sessionID string, rc *relayConn) {
	r.mu.Lock()
	if r.conns[sessionID] == rc {
		delete(r.conns, sessionID)
	}
	r.mu.Unlock()
}

// Available reports whether sessionID has a live Electron relay connection —
// the engine's RemoteExecutor uses this to decide whether to route through
// the relay at all or let bash.Tool fall back to local execution.
func (r *TerminalRelay) Available(sessionID string) bool {
	r.mu.Lock()
	_, ok := r.conns[sessionID]
	r.mu.Unlock()
	return ok
}

// Run relays command to sessionID's visible terminal and blocks until
// Electron reports completion (via Resolve, called from the connection's
// read loop) or ctx is cancelled.
func (r *TerminalRelay) Run(ctx context.Context, sessionID, command, cwd string) (TerminalResult, error) {
	r.mu.Lock()
	rc, ok := r.conns[sessionID]
	if !ok {
		r.mu.Unlock()
		return TerminalResult{}, fmt.Errorf("no terminal relay connection for session %s", sessionID)
	}
	r.nextID++
	id := fmt.Sprintf("%s-%d", sessionID, r.nextID)
	ch := make(chan TerminalResult, 1)
	r.pending[id] = ch
	r.mu.Unlock()

	defer func() {
		r.mu.Lock()
		delete(r.pending, id)
		r.mu.Unlock()
	}()

	payload, err := json.Marshal(TerminalCommand{ID: id, Command: command, Cwd: cwd})
	if err != nil {
		return TerminalResult{}, err
	}

	rc.writeMu.Lock()
	err = rc.conn.WriteMessage(websocket.TextMessage, payload)
	rc.writeMu.Unlock()
	if err != nil {
		return TerminalResult{}, fmt.Errorf("write to terminal relay: %w", err)
	}

	select {
	case res := <-ch:
		return res, nil
	case <-ctx.Done():
		return TerminalResult{}, ctx.Err()
	}
}

// Resolve delivers Electron's completion payload to whichever Run call is
// awaiting it. Called from the WS handler's per-connection read loop.
func (r *TerminalRelay) Resolve(res TerminalResult) {
	r.mu.Lock()
	ch, ok := r.pending[res.ID]
	r.mu.Unlock()
	if !ok {
		return
	}
	ch <- res
}
