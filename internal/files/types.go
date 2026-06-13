package files

import "time"

// File is the backend-layer view of an uploaded file.
type File struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	WorkspaceID  string    `json:"workspace_id,omitempty"`
	SessionID    string    `json:"session_id,omitempty"`
	Category     string    `json:"category,omitempty"`
	LocalPath    string    `json:"local_path,omitempty"`
	MarkdownPath string    `json:"markdown_path,omitempty"` // set when docling conversion succeeded
	Filename     string    `json:"filename"`
	ContentType  string    `json:"content_type"`
	Size         int64     `json:"size"`
	SHA256       string    `json:"sha256,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type UploadFileParams struct {
	Filename    string
	ContentType string
	Data        []byte
	WorkspaceID string // optional
}

const (
	CategoryImages    = "images"
	CategoryDocuments = "documents"
	CategoryAudio     = "audio"
	CategoryOther     = "other"
)

// doclingExtensions lists file extensions that docling-serve can convert to markdown.
var doclingExtensions = map[string]bool{
	".pdf":  true,
	".docx": true,
	".pptx": true,
	".xlsx": true,
	".html": true,
	".htm":  true,
	".tex":  true,
	".wav":  true,
	".mp3":  true,
	".png":  true,
	".tiff": true,
	".tif":  true,
	".jpeg": true,
	".jpg":  true,
}
