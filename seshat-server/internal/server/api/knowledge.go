package api

import (
	"io"
	"net/http"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

// maxUploadBytes caps a single knowledge-base file upload. Not yet exposed
// as a per-organization setting — a reasonable fixed default (25 MiB, well
// above typical policy/procedure documents) until there's a concrete need
// to tune it.
const maxUploadBytes = 25 << 20

type createCorpusRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Description    string `json:"description"`
}

type updateCorpusRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type searchCorpusRequest struct {
	Query string `json:"query"`
	TopK  int    `json:"top_k"`
}

func (app *App) handleCorpora(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		query, err := parseListQuery(r, "name", "asc")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		corpora, total, err := app.backend.Knowledge.ListCorpora(r.Context(), principal, organizationID, sdb.ListParams{
			Search: query.Search,
			Sort:   query.Sort,
			Order:  query.Order,
			Limit:  query.Limit,
			Offset: query.Offset,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeListResponse(w, http.StatusOK, "corpora", corpora, query, int(total))
	case http.MethodPost:
		var req createCorpusRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		corpus, err := app.backend.Knowledge.CreateCorpus(r.Context(), principal, knowledge.CreateCorpusParams{
			OrganizationID: req.OrganizationID,
			Name:           req.Name,
			Description:    req.Description,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, corpus)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleCorpusByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	corpusID := strings.TrimSpace(r.PathValue("corpusID"))
	if corpusID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing corpus id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		corpus, err := app.backend.Knowledge.GetCorpus(r.Context(), principal, corpusID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, corpus)
	case http.MethodPut:
		var req updateCorpusRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		corpus, err := app.backend.Knowledge.UpdateCorpus(r.Context(), principal, corpusID, knowledge.UpdateCorpusParams{
			Name:        req.Name,
			Description: req.Description,
		})
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, corpus)
	case http.MethodDelete:
		if err := app.backend.Knowledge.DeleteCorpus(r.Context(), principal, corpusID); err != nil {
			writeKnowledgeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleCorpusFiles(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	corpusID := strings.TrimSpace(r.PathValue("corpusID"))
	if corpusID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing corpus id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		files, err := app.backend.Knowledge.ListFiles(r.Context(), principal, corpusID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"files": files, "count": len(files)})
	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
		if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid multipart upload (or file too large): "+err.Error())
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "missing \"file\" form field")
			return
		}
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "read uploaded file: "+err.Error())
			return
		}
		contentType := header.Header.Get("Content-Type")
		corpusFile, err := app.backend.Knowledge.UploadFile(r.Context(), principal, corpusID, header.Filename, contentType, data)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, corpusFile)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleCorpusFileByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	corpusID := strings.TrimSpace(r.PathValue("corpusID"))
	fileID := strings.TrimSpace(r.PathValue("fileID"))
	if corpusID == "" || fileID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing corpus or file id")
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if err := app.backend.Knowledge.DetachFile(r.Context(), principal, corpusID, fileID); err != nil {
			writeKnowledgeError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleCorpusIngestionJobs(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	corpusID := strings.TrimSpace(r.PathValue("corpusID"))
	if corpusID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing corpus id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		jobs, err := app.backend.Knowledge.ListIngestionJobs(r.Context(), principal, corpusID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ingestion_jobs": jobs, "count": len(jobs)})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleCorpusIngestionJobByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	corpusID := strings.TrimSpace(r.PathValue("corpusID"))
	jobID := strings.TrimSpace(r.PathValue("jobID"))
	if corpusID == "" || jobID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing corpus or job id")
		return
	}

	switch r.Method {
	case http.MethodGet:
		job, err := app.backend.Knowledge.GetIngestionJob(r.Context(), principal, corpusID, jobID)
		if err != nil {
			writeKnowledgeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, job)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleCorpusIngestionJobRetry(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	corpusID := strings.TrimSpace(r.PathValue("corpusID"))
	jobID := strings.TrimSpace(r.PathValue("jobID"))
	if corpusID == "" || jobID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing corpus or job id")
		return
	}
	job, err := app.backend.Knowledge.RetryIngestionJob(r.Context(), principal, corpusID, jobID)
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (app *App) handleCorpusSearch(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	corpusID := strings.TrimSpace(r.PathValue("corpusID"))
	if corpusID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing corpus id")
		return
	}
	var req searchCorpusRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	resp, err := app.backend.Knowledge.Search(r.Context(), principal, knowledge.SearchParams{
		CorpusID: corpusID,
		Query:    req.Query,
		TopK:     req.TopK,
	})
	if err != nil {
		writeKnowledgeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
