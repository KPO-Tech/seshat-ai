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
//
// Also reaps accounts due for a separate, ACL-only permission refresh (see
// reapDuePermissionAccounts below) - only ever true for an account whose
// connector implements permissionRefresher, since NextPermissionSyncAt is
// only set for those in the first place (see CompleteConnectorOAuth).
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
	return s.reapDuePermissionAccounts(ctx, now)
}

// reapDuePermissionAccounts mirrors the content-sync reap loop above
// exactly, for accounts whose NextPermissionSyncAt has elapsed - a separate
// query/reschedule/enqueue pass rather than folding into the loop above,
// since the two schedules are independent (an account can be due for one,
// the other, both, or neither on any given tick).
func (s *Service) reapDuePermissionAccounts(ctx context.Context, now time.Time) error {
	var due []sdb.ConnectorAccount
	if err := s.db.Gorm().WithContext(ctx).
		Where("status = ? AND next_permission_sync_at IS NOT NULL AND next_permission_sync_at <= ?", StatusConnected, now).
		Find(&due).Error; err != nil {
		return err
	}
	for _, account := range due {
		next := now.Add(time.Duration(account.PermissionSyncIntervalSeconds) * time.Second)
		if err := s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorAccount{}).
			Where("id = ?", account.ID).Update("next_permission_sync_at", &next).Error; err != nil {
			return err
		}
		if account.CorpusID == nil {
			continue
		}
		if _, err := s.enqueuePermissionSyncJob(ctx, account.OrganizationID, *account.CorpusID, account.ID); err != nil {
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
	account, conn, secret, ok := s.loadAccountConnectorAndSecret(ctx, job)
	if !ok {
		return
	}
	if job.SyncKind == SyncJobKindPermissions {
		s.processPermissionSyncJob(ctx, job, account, conn, secret)
		return
	}
	s.processContentSyncJob(ctx, job, account, conn, secret)
}

// loadAccountConnectorAndSecret is the shared prologue both sync job kinds
// need: load the account, resolve its connector, decrypt its credentials.
// On any failure it marks the job (and, past the account-lookup step, the
// account itself) failed and returns ok=false, so callers can just return.
func (s *Service) loadAccountConnectorAndSecret(ctx context.Context, job sdb.ConnectorSyncJob) (sdb.ConnectorAccount, knowledgeConnector, syncSecret, bool) {
	var account sdb.ConnectorAccount
	if err := s.db.Gorm().WithContext(ctx).First(&account, "id = ?", job.ConnectorAccountID).Error; err != nil {
		s.markSyncJobFailed(ctx, job, "connector account no longer exists")
		return sdb.ConnectorAccount{}, nil, syncSecret{}, false
	}
	conn, err := s.connectorFor(ctx, account.Kind, account.OrganizationID)
	if err != nil {
		s.markSyncJobFailed(ctx, job, err.Error())
		s.markAccountError(ctx, account.ID, err.Error())
		return sdb.ConnectorAccount{}, nil, syncSecret{}, false
	}

	accessToken, err := sdb.DecryptSecret(s.db.Gorm().WithContext(ctx), account.OrganizationID, account.AccessTokenEncrypted)
	if err != nil {
		s.markSyncJobFailed(ctx, job, "decrypt access secret: "+err.Error())
		s.markAccountError(ctx, account.ID, "decrypt access secret: "+err.Error())
		return sdb.ConnectorAccount{}, nil, syncSecret{}, false
	}
	refreshToken, err := sdb.DecryptSecret(s.db.Gorm().WithContext(ctx), account.OrganizationID, account.RefreshTokenEncrypted)
	if err != nil {
		s.markSyncJobFailed(ctx, job, "decrypt refresh secret: "+err.Error())
		s.markAccountError(ctx, account.ID, "decrypt refresh secret: "+err.Error())
		return sdb.ConnectorAccount{}, nil, syncSecret{}, false
	}
	return account, conn, syncSecret{AccessToken: accessToken, RefreshToken: refreshToken}, true
}

func (s *Service) processContentSyncJob(ctx context.Context, job sdb.ConnectorSyncJob, account sdb.ConnectorAccount, conn knowledgeConnector, secret syncSecret) {
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

	items, nextCursor, err := conn.Sync(ctx, connAccount, secret, account.SyncCursor)
	if err != nil {
		s.markSyncJobFailed(ctx, job, "sync: "+err.Error())
		s.markAccountError(ctx, account.ID, "sync: "+err.Error())
		return
	}

	synced := 0
	for _, item := range items {
		if _, err := s.knowledge.IngestFromConnector(ctx, account.OrganizationID, job.CorpusID, account.ID, item.ID, account.CreatedByUserID, item.Name, item.ContentType, item.Data, item.Text, accessEntriesToStrings(item.AccessControl)); err != nil {
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

// processPermissionSyncJob refreshes only the ACL for CorpusFiles already
// known to this connector account - no content re-fetch, no re-chunking,
// no re-indexing, no IngestFromConnector call at all. See
// permissionRefresher's doc comment (types.go).
func (s *Service) processPermissionSyncJob(ctx context.Context, job sdb.ConnectorSyncJob, account sdb.ConnectorAccount, conn knowledgeConnector, secret syncSecret) {
	refresher, ok := conn.(permissionRefresher)
	if !ok {
		// Shouldn't happen - CompleteConnectorOAuth only ever schedules a
		// permissions job for a connector kind that implements this - but a
		// clear failure beats a panic if it somehow does.
		s.markSyncJobFailed(ctx, job, "connector does not support permission refresh")
		return
	}

	var files []sdb.CorpusFile
	if err := s.db.Gorm().WithContext(ctx).
		Where("connector_account_id = ?", account.ID).
		Find(&files).Error; err != nil {
		s.markSyncJobFailed(ctx, job, "load known files: "+err.Error())
		return
	}
	if len(files) == 0 {
		s.completePermissionSyncJob(ctx, job, 0)
		return
	}
	resourceIDs := make([]string, 0, len(files))
	byResourceID := make(map[string]sdb.CorpusFile, len(files))
	for _, f := range files {
		resourceIDs = append(resourceIDs, f.ExternalResourceID)
		byResourceID[f.ExternalResourceID] = f
	}

	refreshed, err := refresher.RefreshPermissions(ctx, secret, resourceIDs)
	if err != nil {
		s.markSyncJobFailed(ctx, job, "refresh permissions: "+err.Error())
		s.markAccountError(ctx, account.ID, "refresh permissions: "+err.Error())
		return
	}

	// A resourceID absent from refreshed means its lookup failed this pass
	// (see permissionRefresher's doc comment) - that file's own
	// ExternalAccess is left exactly as it was, not touched here at all.
	updated := 0
	for resourceID, acl := range refreshed {
		file, ok := byResourceID[resourceID]
		if !ok {
			continue
		}
		// Full load-mutate-Save (not a column-targeted Updates call), same
		// reasoning as IngestFromConnector's update path (connectors.go) -
		// GORM's serializer for a JSON-tagged field is only guaranteed to
		// run on a struct-based Save, and Save needs every other field
		// already populated (from the Find above) or it would zero them out.
		file.ExternalAccess = accessEntriesToStrings(acl)
		if err := s.db.Gorm().WithContext(ctx).Save(&file).Error; err == nil {
			updated++
		}
	}
	s.completePermissionSyncJob(ctx, job, updated)
}

func (s *Service) completePermissionSyncJob(ctx context.Context, job sdb.ConnectorSyncJob, updated int) {
	now := time.Now().UTC()
	_ = s.db.Gorm().WithContext(ctx).Model(&sdb.ConnectorSyncJob{}).Where("id = ?", job.ID).
		Updates(map[string]any{"status": SyncJobStatusCompleted, "completed_at": &now, "items_synced": updated}).Error
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
