package automation

import (
	"context"
	"testing"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

func TestRegisterListRevokeDeviceFlow(t *testing.T) {
	env := newTestEnv(t)

	result, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{
		OrganizationID: env.orgID,
		Name:           "Admin's Laptop",
		Platform:       "darwin",
		AppVersion:     "1.0.0",
	})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	if result.Token == "" {
		t.Fatal("expected a device token to be issued")
	}
	if result.Device.Status != DeviceStatusActive {
		t.Fatalf("unexpected initial status: %s", result.Device.Status)
	}

	var stored sdb.Device
	if err := env.db.Gorm().First(&stored, "id = ?", result.Device.ID).Error; err != nil {
		t.Fatalf("load stored device: %v", err)
	}
	if stored.Token == result.Token {
		t.Fatal("expected the stored device token to be hashed")
	}

	devices, err := env.automation.ListDevices(context.Background(), env.adminPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("list devices: %v", err)
	}
	if len(devices) != 1 || devices[0].ID != result.Device.ID {
		t.Fatalf("expected the registered device in the list, got %+v", devices)
	}

	if _, err := env.automation.ResolveDevice(context.Background(), result.Token); err != nil {
		t.Fatalf("expected active device token to resolve: %v", err)
	}

	if err := env.automation.RevokeDevice(context.Background(), env.adminPrincipal, result.Device.ID); err != nil {
		t.Fatalf("revoke device: %v", err)
	}
	if _, err := env.automation.ResolveDevice(context.Background(), result.Token); err == nil {
		t.Fatal("expected a revoked device token to be rejected")
	}
}

func TestRevokingDevicePausesTargetedJobsFailsAssignedRunsAndBlocksNewQueueing(t *testing.T) {
	env := newTestEnv(t)
	result, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{
		OrganizationID: env.orgID,
		Name:           "Worker",
	})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	job, err := env.automation.CreateJob(context.Background(), env.adminPrincipal, CreateJobParams{
		OrganizationID:  env.orgID,
		Name:            "Device job",
		TriggerType:     TriggerTypeInterval,
		IntervalSeconds: 3600,
		ExecutionTarget: ExecutionTargetDevice,
		TargetDeviceID:  result.Device.ID,
		Prompt:          "Do local work.",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	run, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("trigger job now: %v", err)
	}

	if err := env.automation.RevokeDevice(context.Background(), env.adminPrincipal, result.Device.ID); err != nil {
		t.Fatalf("revoke device: %v", err)
	}

	reloadedJob, err := env.automation.GetJob(context.Background(), env.adminPrincipal, job.ID)
	if err != nil {
		t.Fatalf("get job: %v", err)
	}
	if reloadedJob.Status != JobStatusPaused {
		t.Fatalf("expected target job to be paused on device revocation, got %s", reloadedJob.Status)
	}
	reloadedRun, err := env.automation.GetRun(context.Background(), env.adminPrincipal, run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if reloadedRun.Status != RunStatusFailed {
		t.Fatalf("expected assigned run to fail on device revocation, got %s", reloadedRun.Status)
	}
	if reloadedRun.ExitReason != "device revoked" {
		t.Fatalf("expected device revocation exit reason, got %q", reloadedRun.ExitReason)
	}

	if _, err := env.automation.TriggerJobNow(context.Background(), env.adminPrincipal, job.ID); err == nil {
		t.Fatal("expected triggering a revoked-device job to be rejected")
	}
	if _, err := env.automation.ResolveDevice(context.Background(), result.Token); err == nil {
		t.Fatal("expected revoked device token to stop resolving")
	}
}

func TestMemberCanRegisterAndRevokeTheirOwnDevice(t *testing.T) {
	env := newTestEnv(t)
	memberPrincipal := env.addMember(t, "member")

	result, err := env.automation.RegisterDevice(context.Background(), memberPrincipal, RegisterDeviceParams{
		OrganizationID: env.orgID,
		Name:           "Member's Desktop",
	})
	if err != nil {
		t.Fatalf("expected a member to self-register a device: %v", err)
	}

	// A member without devices.read sees an empty device list (scoped
	// visibility, like every other list endpoint — not an error)...
	devices, err := env.automation.ListDevices(context.Background(), memberPrincipal, env.orgID)
	if err != nil {
		t.Fatalf("unexpected error listing devices as member: %v", err)
	}
	if len(devices) != 0 {
		t.Fatalf("expected a member without devices.read to see no devices, got %d", len(devices))
	}
	// ...but can still revoke the device they themselves registered.
	if err := env.automation.RevokeDevice(context.Background(), memberPrincipal, result.Device.ID); err != nil {
		t.Fatalf("expected a member to revoke their own device: %v", err)
	}
}

func TestMemberCannotRevokeAnotherUsersDevice(t *testing.T) {
	env := newTestEnv(t)
	viewerPrincipal := env.addMember(t, "viewer")
	otherMemberPrincipal := env.addMember(t, "member")

	result, err := env.automation.RegisterDevice(context.Background(), otherMemberPrincipal, RegisterDeviceParams{
		OrganizationID: env.orgID,
		Name:           "Other Member's Desktop",
	})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	if err := env.automation.RevokeDevice(context.Background(), viewerPrincipal, result.Device.ID); err == nil {
		t.Fatal("expected a viewer to be denied revoking someone else's device")
	}
}

func TestHeartbeatUpdatesLastSeenAt(t *testing.T) {
	env := newTestEnv(t)
	result, err := env.automation.RegisterDevice(context.Background(), env.adminPrincipal, RegisterDeviceParams{
		OrganizationID: env.orgID,
		Name:           "Admin's Laptop",
	})
	if err != nil {
		t.Fatalf("register device: %v", err)
	}
	if result.Device.LastSeenAt != nil {
		t.Fatal("expected no last_seen_at before the first heartbeat")
	}

	device, err := env.automation.Heartbeat(context.Background(), result.Token)
	if err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	if device.LastSeenAt == nil {
		t.Fatal("expected last_seen_at to be set after a heartbeat")
	}
}
