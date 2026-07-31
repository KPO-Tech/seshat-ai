// Package officeconvert renders office documents (DOCX/PPTX/XLSX/...) to PDF
// via a headless LibreOffice invocation, so they can go through the same
// interactive PDF viewer already built for actual .pdf attachments instead
// of a flat text/markdown dump. This is deliberately the same shape as
// docling in this codebase: an optional local dependency that's detected at
// call time, with callers expected to fall back gracefully (to the
// docling-markdown text preview) when it isn't installed.
package officeconvert

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Converter finds and drives a local `soffice` (LibreOffice) binary.
// Conversions are serialized (mu): concurrent `soffice --headless` instances
// aren't reliably safe even with isolated profiles, and this is a low-
// frequency on-demand operation (a user or agent opening one document at a
// time), not a hot path that needs real concurrency.
type Converter struct {
	once       sync.Once
	binaryPath string
	mu         sync.Mutex
}

// Default is the package-level Converter every caller shares, so the binary
// is only probed for once per process.
var Default = &Converter{}

func (c *Converter) resolve() string {
	c.once.Do(func() {
		c.binaryPath = findSoffice()
	})
	return c.binaryPath
}

// IsAvailable reports whether a usable LibreOffice install was found.
func (c *Converter) IsAvailable() bool {
	return c.resolve() != ""
}

// ConvertToPDF renders inputPath to a PDF written into outDir (created if
// missing) and returns the resulting file's path.
func (c *Converter) ConvertToPDF(ctx context.Context, inputPath, outDir string) (string, error) {
	bin := c.resolve()
	if bin == "" {
		return "", fmt.Errorf("libreoffice (soffice) not found")
	}
	if err := os.MkdirAll(outDir, 0o700); err != nil {
		return "", fmt.Errorf("create output dir: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// An isolated profile per conversion - soffice --headless instances that
	// share the default user profile can fail to start or hang when another
	// instance already holds its lock, which would otherwise turn "two users
	// open a document preview at almost the same time" into a real failure
	// even with the mutex above serializing our own calls (a leftover soffice
	// process from a previous crashed/timed-out conversion could still be
	// holding the default profile).
	profileDir, err := os.MkdirTemp("", "seshat-soffice-profile-*")
	if err != nil {
		return "", fmt.Errorf("create soffice profile dir: %w", err)
	}
	defer os.RemoveAll(profileDir)

	convertCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	profileURL := "file:///" + filepath.ToSlash(profileDir)
	cmd := exec.CommandContext(convertCtx, bin,
		"--headless",
		"--norestore",
		"--nolockcheck",
		"-env:UserInstallation="+profileURL,
		"--convert-to", "pdf",
		"--outdir", outDir,
		inputPath,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if convertCtx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("libreoffice conversion timed out")
		}
		return "", fmt.Errorf("libreoffice conversion failed: %w (%s)", err, strings.TrimSpace(string(output)))
	}

	base := strings.TrimSuffix(filepath.Base(inputPath), filepath.Ext(inputPath))
	pdfPath := filepath.Join(outDir, base+".pdf")
	if _, statErr := os.Stat(pdfPath); statErr != nil {
		return "", fmt.Errorf("libreoffice did not produce the expected output %s: %w (%s)", pdfPath, statErr, strings.TrimSpace(string(output)))
	}
	return pdfPath, nil
}

func findSoffice() string {
	if p, err := exec.LookPath("soffice"); err == nil {
		return p
	}

	var candidates []string
	switch runtime.GOOS {
	case "windows":
		candidates = []string{
			`C:\Program Files\LibreOffice\program\soffice.exe`,
			`C:\Program Files (x86)\LibreOffice\program\soffice.exe`,
		}
	case "darwin":
		candidates = []string{
			"/Applications/LibreOffice.app/Contents/MacOS/soffice",
		}
	default:
		candidates = []string{
			"/usr/bin/soffice",
			"/usr/lib/libreoffice/program/soffice",
			"/opt/libreoffice/program/soffice",
		}
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return ""
}
