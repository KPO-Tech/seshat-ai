package knowledge

import (
	"encoding/json"
	"time"

	sdkdocumentreader "github.com/KPO-Tech/seshat/pkg/documentreader"
)

// NewDoclingCompatibleReader keeps existing DOCLING_URL deployments working
// while the rest of seshat-server depends only on documentreader interfaces.
func NewDoclingCompatibleReader(baseURL string, timeout time.Duration) (sdkdocumentreader.HybridChunker, error) {
	return sdkdocumentreader.NewGenericClient(sdkdocumentreader.GenericConfig{
		BaseURL:    baseURL,
		FileField:  "files",
		ChunkPath:  "/v1/chunk/hybrid/file",
		ParseChunk: parseDocumentReaderChunks,
		Timeout:    timeout,
	})
}

func parseDocumentReaderChunks(rawBody []byte) ([]sdkdocumentreader.Chunk, error) {
	var response struct {
		Chunks []sdkdocumentreader.Chunk `json:"chunks"`
	}
	if err := json.Unmarshal(rawBody, &response); err != nil {
		return nil, err
	}
	return response.Chunks, nil
}
