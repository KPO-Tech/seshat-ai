package connectors

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// ReapDueAccounts enqueues a sync job for every connected account whose
// NextSyncAt has elapsed, then reschedules that account's NextSyncAt one
// interval out - periodic auto-sync doesn't need a separate cron, just this
// poll loop noticing due accounts each tick. Relies on enqueueSyncJob's own
// queued/running dedup rather than a stricter claim, so a rare race between
// two seshat-server processes reaping the same tick converges on one job,
// not a hard error.
func (s *Service) ReapDueAccounts(ctx context.Context) error {
	now := time.Now().UTC()
	var due []sdb.ConnectorAccount
	if err := s.db.Gorm().WithContext(ctx).
		Where("status = ? AND next_sync_at IS NOT NULL AND next_sync_at <= ?", StatusConnected, now).
		Find(&due).Error; err != nil {
		return err
	}
	for _, account := range due {
		next := now.Add(time.Duration(account.SyncIntervalSeconds) * time.Second)
		if err := s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorAccount{}).
			Where("id = ?", account.ID).Update("next_sync_at", &next).Error; err != nil {
			return err
		}
		// CorpusID is nullable (see sdb.ConnectorAccount's doc comment) for a
		// future non-Knowledge connector account - one shouldn't set
		// NextSyncAt in the first place (only CreateS3Account does, a
		// Knowledge-purposed creation path), so this is a defensive skip, not
		// an expected case.
		if account.CorpusID == nil {
			continue
		}
		if _, err := s.enqueueSyncJob(ctx, account.OrganizationID, *account.CorpusID, account.ID); err != nil {
			return err
		}
	}
	return nil
}

// ProcessNextConnectorSyncJob claims and processes one due sync job.
// Returns false when there is nothing to do right now. Safe to run on more
// than one seshat-server process concurrently - same atomic claim idiom as
// knowledge.Service.ProcessNextIngestionJob.
func (s *Service) ProcessNextConnectorSyncJob(ctx context.Context) (bool, error) {
	job, ok, err := s.claimNextSyncJob(ctx)
	if err != nil {
		return false, err
	}
	if !ok {
		return false, nil
	}
	s.processSyncJob(ctx, job)
	return true, nil
}

func (s *Service) claimNextSyncJob(ctx context.Context) (sdb.ConnectorSyncJob, bool, error) {
	now := time.Now().UTC()
	staleBefore := now.Add(-defaultStaleSyncTimeout)

	var job sdb.ConnectorSyncJob
	err := s.db.Gorm().WithContext(ctx).
		Where("status = ? AND (next_run_at IS NULL OR next_run_at <= ?)", SyncJobStatusQueued, now).
		Or("status = ? AND started_at <= ?", SyncJobStatusRunning, staleBefore).
		Order("created_at asc").
		First(&job).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return sdb.ConnectorSyncJob{}, false, nil
		}
		return sdb.ConnectorSyncJob{}, false, err
	}

	claim := s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorSyncJob{}).
		Where("id = ? AND status = ?", job.ID, job.Status).
		Updates(map[string]any{"status": SyncJobStatusRunning, "started_at": now})
	if claim.Error != nil {
		return sdb.ConnectorSyncJob{}, false, claim.Error
	}
	if claim.RowsAffected == 0 {
		return sdb.ConnectorSyncJob{}, false, nil // claimed by a concurrent tick
	}
	job.Status = SyncJobStatusRunning
	job.StartedAt = &now
	return job, true, nil
}

func (s *Service) processSyncJob(ctx context.Context, job sdb.ConnectorSyncJob) {
	var account sdb.ConnectorAccount
	if err := s.db.Gorm().WithContext(ctx).First(&account, "id = ?", job.ConnectorAccountID).Error; err != nil {
		s.markSyncJobFailed(ctx, job, "connector account no longer exists")
		return
	}
	conn, err := s.connectorFor(ctx, account.Kind, account.OrganizationID)
	if err != nil {
		s.markSyncJobFailed(ctx, job, err.Error())
		s.markAccountError(ctx, account.ID, err.Error())
		return
	}

	accessToken, err := sdb.DecryptSecret(s.db.Gorm().WithContext(ctx), account.OrganizationID, account.AccessTokenEncrypted)
	if err != nil {
		s.markSyncJobFailed(ctx, job, "decrypt access secret: "+err.Error())
		s.markAccountError(ctx, account.ID, "decrypt access secret: "+err.Error())
		return
	}
	refreshToken, err := sdb.DecryptSecret(s.db.Gorm().WithContext(ctx), account.OrganizationID, account.RefreshTokenEncrypted)
	if err != nil {
		s.markSyncJobFailed(ctx, job, "decrypt refresh secret: "+err.Error())
		s.markAccountError(ctx, account.ID, "decrypt refresh secret: "+err.Error())
		return
	}

	// job.CorpusID (not account.CorpusID, which is nullable - see
	// sdb.ConnectorAccount's doc comment) is the reliable source here: every
	// ConnectorSyncJob targets a real corpus by definition, non-nullable.
	connAccount := syncAccount{
		ID:             account.ID,
		OrganizationID: account.OrganizationID,
		CorpusID:       job.CorpusID,
		Status:         account.Status,
		Config:         account.Config,
	}
	secret := syncSecret{AccessToken: accessToken, RefreshToken: refreshToken}

	items, nextCursor, err := conn.Sync(ctx, connAccount, secret, account.SyncCursor)
	if err != nil {
		s.markSyncJobFailed(ctx, job, "sync: "+err.Error())
		s.markAccountError(ctx, account.ID, "sync: "+err.Error())
		return
	}

	synced := 0
	for _, item := range items {
		if _, err := s.knowledge.IngestFromConnector(ctx, account.OrganizationID, job.CorpusID, account.ID, item.ID, account.CreatedByUserID, item.Name, item.ContentType, item.Data, item.Text); err != nil {
			continue // one bad item shouldn't fail the whole sync
		}
		synced++
	}

	now := time.Now().UTC()
	updates := map[string]any{"sync_cursor": nextCursor, "last_synced_at": &now, "last_error": "", "status": StatusConnected}
	s.applyRefreshedTokenIfAny(ctx, conn, account.OrganizationID, updates)
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorAccount{}).Where("id = ?", account.ID).
		Updates(updates).Error

	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorSyncJob{}).Where("id = ?", job.ID).
		Updates(map[string]any{"status": SyncJobStatusCompleted, "completed_at": &now, "items_synced": synced}).Error
}

// tokenRefreshReporter is implemented by connectors whose OAuth provider
// rotates refresh tokens on every use (confluenceConnector, today) - see
// ConfluenceConnector's package doc comment in core/connectors for why the
// "never persist a refreshed token" pattern every other connector here
// relies on would silently break this one after roughly its second sync.
type tokenRefreshReporter interface {
	RefreshedToken() (accessToken, refreshToken string, expiry time.Time, ok bool)
}

// applyRefreshedTokenIfAny folds a rotated credential pair into updates (the
// same map processSyncJob is about to persist for sync_cursor/
// last_synced_at) so there is no extra DB round trip - a no-op for every
// connector kind that doesn't implement tokenRefreshReporter, or that does
// but didn't actually rotate this call.
func (s *Service) applyRefreshedTokenIfAny(ctx context.Context, conn knowledgeConnector, organizationID string, updates map[string]any) {
	reporter, ok := conn.(tokenRefreshReporter)
	if !ok {
		return
	}
	accessToken, refreshToken, expiry, refreshed := reporter.RefreshedToken()
	if !refreshed {
		return
	}
	tx := s.db.Gorm().WithContext(ctx)
	accessEnc, err := sdb.EncryptSecret(tx, organizationID, accessToken)
	if err != nil {
		return // best-effort - the stale-but-still-valid-until-next-rotation token stays in place
	}
	refreshEnc, err := sdb.EncryptSecret(tx, organizationID, refreshToken)
	if err != nil {
		return
	}
	updates["access_token_encrypted"] = accessEnc
	updates["refresh_token_encrypted"] = refreshEnc
	updates["expires_at"] = &expiry
}

func (s *Service) markAccountError(ctx context.Context, accountID, message string) {
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorAccount{}).Where("id = ?", accountID).
		Updates(map[string]any{"status": StatusError, "last_error": message}).Error
}

func (s *Service) markSyncJobFailed(ctx context.Context, job sdb.ConnectorSyncJob, reason string) {
	attempts := job.AttemptCount + 1
	status := SyncJobStatusFailed
	var nextRunAt *time.Time
	if attempts < job.MaxAttempts {
		status = SyncJobStatusQueued
		at := time.Now().UTC().Add(defaultSyncRetryDelay)
		nextRunAt = &at
	}
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorSyncJob{}).Where("id = ?", job.ID).
		Updates(map[string]any{"status": status, "attempt_count": attempts, "last_error": reason, "next_run_at": nextRunAt}).Error
}
