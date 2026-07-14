package cloudautomation

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Service backs the local /automation/* HTTP handlers (status, connect,
// disconnect, recent runs). Job management itself is not exposed here — it
// happens exclusively in seshat-console once connected.
type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

// Connect validates the pasted device token by heartbeating with it, then
// persists the connection. userID is whichever local seshat-backend user
// performed this action — captured so the JobExecutor knows whose local
// credentials/context to run claimed jobs under.
func (s *Service) Connect(ctx context.Context, userID, serverURL, deviceToken string) (*Status, error) {
	serverURL = strings.TrimSpace(serverURL)
	deviceToken = strings.TrimSpace(deviceToken)
	if serverURL == "" || deviceToken == "" {
		return nil, fmt.Errorf("server_url and device_token are required")
	}

	client := NewClient(serverURL, deviceToken)
	device, err := client.Heartbeat(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not reach seshat-server with this token: %w", err)
	}

	conn := Connection{
		ServerURL:         serverURL,
		DeviceID:          device.ID,
		DeviceName:        device.Name,
		DeviceToken:       deviceToken,
		ConnectedByUserID: userID,
		ConnectedAt:       time.Now().UTC(),
	}
	if err := s.store.Save(ctx, conn); err != nil {
		return nil, err
	}
	return s.Status(ctx)
}

func (s *Service) Disconnect(ctx context.Context) error {
	return s.store.Clear(ctx)
}

func (s *Service) Status(ctx context.Context) (*Status, error) {
	conn, err := s.store.Load(ctx)
	if err != nil {
		return nil, err
	}
	if conn == nil {
		return &Status{Connected: false}, nil
	}
	connectedAt := conn.ConnectedAt
	return &Status{
		Connected:         true,
		ServerURL:         conn.ServerURL,
		DeviceID:          conn.DeviceID,
		DeviceName:        conn.DeviceName,
		ConnectedByUserID: conn.ConnectedByUserID,
		ConnectedAt:       &connectedAt,
	}, nil
}

// RecentRuns proxies seshat-server's device-scoped run list for local
// visibility (read-only) — job/run management itself stays in seshat-console.
func (s *Service) RecentRuns(ctx context.Context) ([]Run, error) {
	conn, err := s.store.Load(ctx)
	if err != nil {
		return nil, err
	}
	if conn == nil {
		return nil, fmt.Errorf("not connected to a seshat-server instance")
	}
	client := NewClient(conn.ServerURL, conn.DeviceToken)
	return client.MyRuns(ctx)
}
