package automation

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

const (
	DeviceStatusActive  = "active"
	DeviceStatusRevoked = "revoked"
)

// Device is the caller-facing view of a registered seshat-backend instance.
// The bearer token is intentionally not part of this type — it is only ever
// returned once, in RegisterDeviceResult, matching how application client
// secrets are handled.
type Device struct {
	ID                 string     `json:"id"`
	OrganizationID     string     `json:"organization_id"`
	RegisteredByUserID string     `json:"registered_by_user_id"`
	Name               string     `json:"name"`
	Platform           string     `json:"platform"`
	AppVersion         string     `json:"app_version"`
	Status             string     `json:"status"`
	LastSeenAt         *time.Time `json:"last_seen_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// RegisterDeviceResult carries the device plus its bearer token, shown in
// full only in this response.
type RegisterDeviceResult struct {
	Device Device `json:"device"`
	Token  string `json:"token"`
}

type RegisterDeviceParams struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Platform       string `json:"platform"`
	AppVersion     string `json:"app_version"`
}

// RegisterDevice enrolls the caller's own machine with an organization. Any
// member may register a device for themselves — this is self-service, like
// setting up a new machine, not an org-wide administrative action.
func (s *Service) RegisterDevice(ctx context.Context, principal *iam.Principal, params RegisterDeviceParams) (*RegisterDeviceResult, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	if organizationID == "" || name == "" {
		return nil, ErrInvalidInput("organization_id and name are required")
	}
	allowed, err := s.iam.CanAccessOrganization(s.db.Gorm().WithContext(ctx), principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrForbidden("organization access required")
	}

	var result *RegisterDeviceResult
	err = s.db.Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		rawToken, err := newToken()
		if err != nil {
			return err
		}
		deviceID, err := newID("dev")
		if err != nil {
			return err
		}
		record := sdb.Device{
			ID:                 deviceID,
			OrganizationID:     organizationID,
			RegisteredByUserID: principal.User.ID,
			Name:               name,
			Platform:           strings.TrimSpace(params.Platform),
			AppVersion:         strings.TrimSpace(params.AppVersion),
			Status:             DeviceStatusActive,
			Token:              sdb.HashOpaqueToken(rawToken),
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if err := tx.WithContext(ctx).Create(&record).Error; err != nil {
			return err
		}
		if err := s.iam.AppendAuditEvent(tx, principal, organizationID, "device.registered", "device", record.ID, map[string]string{"name": record.Name}); err != nil {
			return err
		}
		result = &RegisterDeviceResult{Device: toDevice(record), Token: rawToken}
		return nil
	})
	return result, err
}

// ListDevices returns devices in an organization the caller can see.
// Consistent with every other list endpoint in this control plane: a caller
// lacking devices.read/devices.manage/organization.manage gets an empty
// list, not a 403 — visibility is scoped, not gated.
func (s *Service) ListDevices(ctx context.Context, principal *iam.Principal, organizationID string) ([]Device, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "devices.read", "devices.manage", "organization.manage"); err != nil {
			return []Device{}, nil
		}
	}

	var records []sdb.Device
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	devices := make([]Device, 0, len(records))
	for _, record := range records {
		devices = append(devices, toDevice(record))
	}
	return devices, nil
}

// RevokeDevice deactivates a device. Allowed for org managers (devices.manage
// or organization.manage) or the user who originally registered the device.
func (s *Service) RevokeDevice(ctx context.Context, principal *iam.Principal, deviceID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		return ErrInvalidInput("device_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Device
		if err := tx.First(&record, "id = ?", deviceID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("device not found")
			}
			return err
		}
		if principal.User.ID != record.RegisteredByUserID {
			if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "devices.manage", "organization.manage"); err != nil {
				return err
			}
		}
		now := time.Now().UTC()
		record.Status = DeviceStatusRevoked
		record.UpdatedAt = now
		if err := tx.Save(&record).Error; err != nil {
			return err
		}

		pausedJobs := int64(0)
		paused := tx.Model(&sdb.ScheduledJob{}).
			Where("organization_id = ? AND execution_target = ? AND target_device_id = ? AND status = ?", record.OrganizationID, ExecutionTargetDevice, record.ID, JobStatusActive).
			Updates(map[string]any{"status": JobStatusPaused, "updated_at": now})
		if paused.Error != nil {
			return paused.Error
		}
		pausedJobs = paused.RowsAffected

		var runs []sdb.JobRun
		if err := tx.Where("organization_id = ? AND assigned_device_id = ? AND status IN ?", record.OrganizationID, record.ID, []string{RunStatusQueued, RunStatusClaimed, RunStatusRunning}).Find(&runs).Error; err != nil {
			return err
		}
		failedRuns := 0
		for _, run := range runs {
			run.Status = RunStatusFailed
			run.FinishedAt = &now
			run.ExitReason = "device revoked"
			run.ErrorText = run.ExitReason
			if err := tx.Save(&run).Error; err != nil {
				return err
			}
			if err := reflectRunOutcomeOnJob(tx, run); err != nil {
				return err
			}
			failedRuns++
		}

		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "device.revoked", "device", record.ID, map[string]string{
			"name":        record.Name,
			"paused_jobs": strconv.FormatInt(pausedJobs, 10),
			"failed_runs": strconv.Itoa(failedRuns),
		})
	})
}

// resolveDeviceByToken authenticates a device-protocol request. Used by the
// API layer's device auth middleware and by Heartbeat below.
func (s *Service) resolveDeviceByToken(ctx context.Context, token string) (sdb.Device, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return sdb.Device{}, ErrUnauthorized("missing device token")
	}
	var record sdb.Device
	err := s.db.Gorm().WithContext(ctx).Where("token = ?", sdb.HashOpaqueToken(token)).First(&record).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.Device{}, ErrUnauthorized("invalid device token")
		}
		return sdb.Device{}, err
	}
	if record.Status != DeviceStatusActive {
		return sdb.Device{}, ErrUnauthorized("device is revoked")
	}
	return record, nil
}

// ResolveDevice authenticates a device bearer token and returns the caller
// view. Exposed for the API layer's device auth middleware.
func (s *Service) ResolveDevice(ctx context.Context, token string) (*Device, error) {
	record, err := s.resolveDeviceByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	device := toDevice(record)
	return &device, nil
}

// HeartbeatResult is the heartbeat response - the usual Device view plus
// this device's resolved desktop policy bundle (see
// iam.Service.ResolveDesktopPolicies). Device is embedded (not nested under
// a "device" key) so the wire shape stays exactly what it was before
// policies existed, plus one new top-level "policies" field - existing
// decoders that only care about the device fields are unaffected.
type HeartbeatResult struct {
	Device
	Policies map[string]bool `json:"policies"`
	// MinAppVersion is the organization's configured minimum app version
	// (nil if none is configured) and AppVersionOutdated is true when this
	// device's own AppVersion is below it. Enforced as a WARNING only, per
	// the desktop policies plan - the device is not blocked, this is purely
	// for the client to surface a banner. Left false whenever either
	// version string fails to parse (missing AppVersion, unset
	// MinAppVersion, or a malformed value) rather than erroring the
	// heartbeat over it.
	MinAppVersion      *string `json:"min_app_version,omitempty"`
	AppVersionOutdated bool    `json:"app_version_outdated"`
}

// Heartbeat records device liveness and resolves this device's current
// desktop policy bundle. Device-authenticated (no user principal) - policies
// are resolved for whoever registered the device (Device.RegisteredByUserID
// within Device.OrganizationID), since that's the identity this device
// connection represents.
func (s *Service) Heartbeat(ctx context.Context, token string) (*HeartbeatResult, error) {
	record, err := s.resolveDeviceByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	record.LastSeenAt = &now
	record.UpdatedAt = now
	if err := s.db.Gorm().WithContext(ctx).Save(&record).Error; err != nil {
		return nil, err
	}
	policies, err := s.iam.ResolveDesktopPolicies(s.db.Gorm().WithContext(ctx), record.OrganizationID, record.RegisteredByUserID)
	if err != nil {
		return nil, err
	}

	var org sdb.Organization
	if err := s.db.Gorm().WithContext(ctx).Select("min_app_version").First(&org, "id = ?", record.OrganizationID).Error; err != nil {
		return nil, err
	}
	outdated := false
	if org.MinAppVersion != nil {
		if cmp, err := iam.CompareAppVersions(record.AppVersion, *org.MinAppVersion); err == nil {
			outdated = cmp < 0
		}
	}

	return &HeartbeatResult{
		Device:             toDevice(record),
		Policies:           policies,
		MinAppVersion:      org.MinAppVersion,
		AppVersionOutdated: outdated,
	}, nil
}

func toDevice(record sdb.Device) Device {
	return Device{
		ID:                 record.ID,
		OrganizationID:     record.OrganizationID,
		RegisteredByUserID: record.RegisteredByUserID,
		Name:               record.Name,
		Platform:           record.Platform,
		AppVersion:         record.AppVersion,
		Status:             record.Status,
		LastSeenAt:         record.LastSeenAt,
		CreatedAt:          record.CreatedAt,
		UpdatedAt:          record.UpdatedAt,
	}
}
