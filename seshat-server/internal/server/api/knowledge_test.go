package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/knowledge"
)

func TestCorpusCRUDAndFileUploadOverHTTP(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"name":            "Supplier Policies",
		"description":     "Internal supplier policy documents",
	})
	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/knowledge/corpora", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+token)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	if createRecorder.Code != http.StatusCreated {
		t.Fatalf("expected create success, got %d: %s", createRecorder.Code, createRecorder.Body.String())
	}
	var corpus knowledge.Corpus
	if err := json.NewDecoder(createRecorder.Body).Decode(&corpus); err != nil {
		t.Fatalf("decode created corpus: %v", err)
	}

	// Upload a file via multipart/form-data.
	var uploadBody bytes.Buffer
	writer := multipart.NewWriter(&uploadBody)
	part, err := writer.CreateFormFile("file", "refund-policy.txt")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("Refunds are processed within 14 business days.")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	uploadRequest := httptest.NewRequest(http.MethodPost, "/api/v1/knowledge/corpora/"+corpus.ID+"/files", &uploadBody)
	uploadRequest.Header.Set("Authorization", "Bearer "+token)
	uploadRequest.Header.Set("Content-Type", writer.FormDataContentType())
	uploadRecorder := httptest.NewRecorder()
	handler.ServeHTTP(uploadRecorder, uploadRequest)
	if uploadRecorder.Code != http.StatusCreated {
		t.Fatalf("expected upload success, got %d: %s", uploadRecorder.Code, uploadRecorder.Body.String())
	}
	var file knowledge.CorpusFile
	if err := json.NewDecoder(uploadRecorder.Body).Decode(&file); err != nil {
		t.Fatalf("decode uploaded file: %v", err)
	}
	if file.Filename != "refund-policy.txt" || file.CorpusID != corpus.ID {
		t.Fatalf("unexpected uploaded file: %+v", file)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v1/knowledge/corpora/"+corpus.ID+"/files", nil)
	listRequest.Header.Set("Authorization", "Bearer "+token)
	listRecorder := httptest.NewRecorder()
	handler.ServeHTTP(listRecorder, listRequest)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("expected list files success, got %d: %s", listRecorder.Code, listRecorder.Body.String())
	}

	deleteFileRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/knowledge/corpora/"+corpus.ID+"/files/"+file.ID, nil)
	deleteFileRequest.Header.Set("Authorization", "Bearer "+token)
	deleteFileRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteFileRecorder, deleteFileRequest)
	if deleteFileRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected file detach success, got %d: %s", deleteFileRecorder.Code, deleteFileRecorder.Body.String())
	}

	deleteCorpusRequest := httptest.NewRequest(http.MethodDelete, "/api/v1/knowledge/corpora/"+corpus.ID, nil)
	deleteCorpusRequest.Header.Set("Authorization", "Bearer "+token)
	deleteCorpusRecorder := httptest.NewRecorder()
	handler.ServeHTTP(deleteCorpusRecorder, deleteCorpusRequest)
	if deleteCorpusRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected corpus delete success, got %d: %s", deleteCorpusRecorder.Code, deleteCorpusRecorder.Body.String())
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api/v1/knowledge/corpora/"+corpus.ID, nil)
	getRequest.Header.Set("Authorization", "Bearer "+token)
	getRecorder := httptest.NewRecorder()
	handler.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected the deleted corpus to 404, got %d", getRecorder.Code)
	}
}

func TestKnowledgeRequiresAuthentication(t *testing.T) {
	handler, _, _, orgID, _ := newTestServerRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/knowledge/corpora?organization_id="+orgID, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a bearer token, got %d", recorder.Code)
	}
}

func TestSearchWithoutRAGConfiguredReturnsAClearError(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	createBody, _ := json.Marshal(map[string]any{"organization_id": orgID, "name": "No Embedder Yet"})
	createRequest := httptest.NewRequest(http.MethodPost, "/api/v1/knowledge/corpora", bytes.NewReader(createBody))
	createRequest.Header.Set("Authorization", "Bearer "+token)
	createRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createRecorder, createRequest)
	var corpus knowledge.Corpus
	if err := json.NewDecoder(createRecorder.Body).Decode(&corpus); err != nil {
		t.Fatalf("decode created corpus: %v", err)
	}

	searchBody, _ := json.Marshal(map[string]any{"query": "refund policy"})
	searchRequest := httptest.NewRequest(http.MethodPost, "/api/v1/knowledge/corpora/"+corpus.ID+"/search", bytes.NewReader(searchBody))
	searchRequest.Header.Set("Authorization", "Bearer "+token)
	searchRecorder := httptest.NewRecorder()
	handler.ServeHTTP(searchRecorder, searchRequest)
	// serverapp.New wires the Knowledge service with no RAG service configured
	// (no embedder yet — see ROADMAP.md), so this must fail clearly rather
	// than panic or silently return an empty result.
	if searchRecorder.Code != http.StatusBadRequest {
		t.Fatalf("expected a clear 400 when RAG isn't configured, got %d: %s", searchRecorder.Code, searchRecorder.Body.String())
	}
}
