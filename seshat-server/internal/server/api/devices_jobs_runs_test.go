package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
)

func TestDeviceJobRunEndToEndOverHTTP(t *testing.T) {
	handler, _, token, orgID, _ := newTestServerRouter(t)

	// Register a device over HTTP (user-authenticated).
	registerBody, _ := json.Marshal(map[string]any{
		"organization_id": orgID,
		"name":            "Worker",
	})
	registerRequest := httptest.NewRequest(http.MethodPost, "/api/v1/devices", bytes.NewReader(registerBody))
	registerRequest.Header.Set("Authorization", "Bearer "+token)
	registerRecorder := httptest.NewRecorder()
	handler.ServeHTTP(registerRecorder, registerRequest)
	if registerRecorder.Code != http.StatusCreated {
		t.Fatalf("expected device registration success, got %d: %s", registerRecorder.Code, registerRecorder.Body.String())
	}
	var registered automation.RegisterDeviceResult
	if err := json.NewDecoder(registerRecorder.Body).Decode(&registered); err != nil {
		t.Fatalf("decode registered device: %v", err)
	}
	if registered.Token == "" {
		t.Fatal("expected a device token")
	}

	// Create a device-targeted job over HTTP (user-authenticated).
	createJobBody, _ := json.Marshal(map[string]any{
		"organization_id":  orgID,
		"name":             "Local sweep",
		"trigger_type":     "interval",
		"interval_seconds": 3600,
		"execution_target": "device",
		"target_device_id": registered.Device.ID,
		"prompt":           "Sweep the local workspace.",
	})
	createJobRequest := httptest.NewRequest(http.MethodPost, "/api/v1/jobs", bytes.NewReader(createJobBody))
	createJobRequest.Header.Set("Authorization", "Bearer "+token)
	createJobRecorder := httptest.NewRecorder()
	handler.ServeHTTP(createJobRecorder, createJobRequest)
	if createJobRecorder.Code != http.StatusCreated {
		t.Fatalf("expected job creation success, got %d: %s", createJobRecorder.Code, createJobRecorder.Body.String())
	}
	var job automation.Job
	if err := json.NewDecoder(createJobRecorder.Body).Decode(&job); err != nil {
		t.Fatalf("decode created job: %v", err)
	}

	// Trigger it immediately over HTTP.
	triggerRequest := httptest.NewRequest(http.MethodPost, "/api/v1/jobs/"+job.ID+"/run", nil)
	triggerRequest.Header.Set("Authorization", "Bearer "+token)
	triggerRecorder := httptest.NewRecorder()
	handler.ServeHTTP(triggerRecorder, triggerRequest)
	if triggerRecorder.Code != http.StatusCreated {
		t.Fatalf("expected trigger success, got %d: %s", triggerRecorder.Code, triggerRecorder.Body.String())
	}
	var run automation.Run
	if err := json.NewDecoder(triggerRecorder.Body).Decode(&run); err != nil {
		t.Fatalf("decode triggered run: %v", err)
	}
	if run.Status != automation.RunStatusQueued {
		t.Fatalf("expected the device run to be queued, got %s", run.Status)
	}

	// Device claims the run using its own device token, not the user's session.
	claimRequest := httptest.NewRequest(http.MethodPost, "/api/v1/device/runs/claim", nil)
	claimRequest.Header.Set("Authorization", "Bearer "+registered.Token)
	claimRecorder := httptest.NewRecorder()
	handler.ServeHTTP(claimRecorder, claimRequest)
	if claimRecorder.Code != http.StatusOK {
		t.Fatalf("expected claim success, got %d: %s", claimRecorder.Code, claimRecorder.Body.String())
	}
	var claimed automation.Run
	if err := json.NewDecoder(claimRecorder.Body).Decode(&claimed); err != nil {
		t.Fatalf("decode claimed run: %v", err)
	}
	if claimed.ID != run.ID {
		t.Fatalf("expected to claim the triggered run, got %s", claimed.ID)
	}

	// Device fetches the execution payload for the run it just claimed.
	runJobRequest := httptest.NewRequest(http.MethodGet, "/api/v1/device/runs/"+run.ID+"/job", nil)
	runJobRequest.Header.Set("Authorization", "Bearer "+registered.Token)
	runJobRecorder := httptest.NewRecorder()
	handler.ServeHTTP(runJobRecorder, runJobRequest)
	if runJobRecorder.Code != http.StatusOK {
		t.Fatalf("expected run job fetch success, got %d: %s", runJobRecorder.Code, runJobRecorder.Body.String())
	}
	var runJob automation.RunJob
	if err := json.NewDecoder(runJobRecorder.Body).Decode(&runJob); err != nil {
		t.Fatalf("decode run job: %v", err)
	}
	if runJob.Prompt != "Sweep the local workspace." {
		t.Fatalf("expected the claimed run's job prompt, got %q", runJob.Prompt)
	}

	// The user's own session token must not be accepted on the device protocol.
	wrongAuthRequest := httptest.NewRequest(http.MethodPost, "/api/v1/device/runs/"+run.ID+"/start", nil)
	wrongAuthRequest.Header.Set("Authorization", "Bearer "+token)
	wrongAuthRecorder := httptest.NewRecorder()
	handler.ServeHTTP(wrongAuthRecorder, wrongAuthRequest)
	if wrongAuthRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected a user session token to be rejected on the device protocol, got %d", wrongAuthRecorder.Code)
	}

	startRequest := httptest.NewRequest(http.MethodPost, "/api/v1/device/runs/"+run.ID+"/start", nil)
	startRequest.Header.Set("Authorization", "Bearer "+registered.Token)
	startRecorder := httptest.NewRecorder()
	handler.ServeHTTP(startRecorder, startRequest)
	if startRecorder.Code != http.StatusOK {
		t.Fatalf("expected start success, got %d: %s", startRecorder.Code, startRecorder.Body.String())
	}

	completeBody, _ := json.Marshal(map[string]any{"output_text": "swept 12 files"})
	completeRequest := httptest.NewRequest(http.MethodPost, "/api/v1/device/runs/"+run.ID+"/complete", bytes.NewReader(completeBody))
	completeRequest.Header.Set("Authorization", "Bearer "+registered.Token)
	completeRecorder := httptest.NewRecorder()
	handler.ServeHTTP(completeRecorder, completeRequest)
	if completeRecorder.Code != http.StatusOK {
		t.Fatalf("expected complete success, got %d: %s", completeRecorder.Code, completeRecorder.Body.String())
	}
	var completed automation.Run
	if err := json.NewDecoder(completeRecorder.Body).Decode(&completed); err != nil {
		t.Fatalf("decode completed run: %v", err)
	}
	if completed.Status != automation.RunStatusCompleted || completed.OutputText != "swept 12 files" {
		t.Fatalf("unexpected completed run state: %+v", completed)
	}

	// The job's run history reflects the completed run over HTTP too.
	jobRunsRequest := httptest.NewRequest(http.MethodGet, "/api/v1/jobs/"+job.ID+"/runs", nil)
	jobRunsRequest.Header.Set("Authorization", "Bearer "+token)
	jobRunsRecorder := httptest.NewRecorder()
	handler.ServeHTTP(jobRunsRecorder, jobRunsRequest)
	if jobRunsRecorder.Code != http.StatusOK {
		t.Fatalf("expected job runs listing success, got %d", jobRunsRecorder.Code)
	}
	var runsPayload struct {
		Runs []automation.Run `json:"runs"`
	}
	if err := json.NewDecoder(jobRunsRecorder.Body).Decode(&runsPayload); err != nil {
		t.Fatalf("decode job runs: %v", err)
	}
	if len(runsPayload.Runs) != 1 || runsPayload.Runs[0].Status != automation.RunStatusCompleted {
		t.Fatalf("unexpected job runs payload: %+v", runsPayload.Runs)
	}
}
