package knowledge

import "time"

type Corpus struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	WorkspaceID string    `json:"workspace_id,omitempty"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	ChunkCount  int       `json:"chunk_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CorpusFile struct {
	CorpusID   string     `json:"corpus_id"`
	FileID     string     `json:"file_id"`
	Filename   string     `json:"filename"`
	Status     string     `json:"status"` // pending / ingested / failed
	ChunkCount int        `json:"chunk_count"`
	IngestedAt *time.Time `json:"ingested_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

type CreateCorpusParams struct {
	Name        string
	Description string
	WorkspaceID string // optional
}

type IngestParams struct {
	CorpusID string
	FileID   string
}

type IngestionJob struct {
	ID           string     `json:"id"`
	CorpusID     string     `json:"corpus_id"`
	FileID       string     `json:"file_id"`
	UserID       string     `json:"user_id"`
	WorkspaceID  string     `json:"workspace_id,omitempty"`
	Filename     string     `json:"filename"`
	Status       string     `json:"status"`
	AttemptCount int        `json:"attempt_count"`
	MaxAttempts  int        `json:"max_attempts"`
	ChunkCount   int        `json:"chunk_count"`
	LastError    string     `json:"last_error,omitempty"`
	ErrorLog     string     `json:"error_log,omitempty"`
	NextRunAt    *time.Time `json:"next_run_at,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type SearchParams struct {
	CorpusID string
	Query    string
	TopK     int
}
