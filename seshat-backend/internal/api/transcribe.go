package api

import (
	"fmt"
	"io"
	"net/http"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
)

const maxTranscribeUploadSize = 26 << 20 // ~26 MB, headroom over OpenAI's 25 MB cap

// handleTranscribe — POST /api/v1/transcribe. Voice-input control: takes a
// recorded audio clip and returns its transcript using the caller's own
// configured OpenAI provider key, independent of any chat session (compare
// the engine's agent-facing speech_to_text tool, which only runs when the
// model itself decides to call it mid-turn).
func (a *App) handleTranscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxTranscribeUploadSize)
	if err := r.ParseMultipartForm(maxTranscribeUploadSize); err != nil {
		writeJSONError(w, http.StatusBadRequest, "failed to parse multipart form: "+err.Error())
		return
	}
	mpFile, _, err := r.FormFile("audio")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "missing 'audio' field in form")
		return
	}
	defer mpFile.Close()
	audioData, err := io.ReadAll(mpFile)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to read uploaded audio")
		return
	}

	apiKey, err := a.resolveOpenAIKeyForTranscription(r, principal)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := a.transcribeAudio(r.Context(), apiKey, audioData)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "transcription failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"text":     result.Text,
		"language": result.Language,
		"duration": result.Duration,
	})
}

// resolveOpenAIKeyForTranscription finds the caller's configured OpenAI
// provider setting and decrypts its API key — voice transcription is
// Whisper-only today, so any other provider type doesn't help here even if
// it's the user's default for chat.
func (a *App) resolveOpenAIKeyForTranscription(r *http.Request, principal *backendauth.Principal) (string, error) {
	settingsList, err := a.backend.Settings.List(r.Context(), principal)
	if err != nil {
		return "", fmt.Errorf("could not look up your providers: %w", err)
	}
	for _, setting := range settingsList {
		if setting.Provider != "openai" {
			continue
		}
		apiKey, err := a.backend.Settings.GetDecryptedAPIKey(r.Context(), principal, setting.ID)
		if err != nil {
			return "", fmt.Errorf("could not read the OpenAI provider's key: %w", err)
		}
		if apiKey != "" {
			return apiKey, nil
		}
	}
	return "", fmt.Errorf("configure an OpenAI provider in Settings to use voice transcription")
}
