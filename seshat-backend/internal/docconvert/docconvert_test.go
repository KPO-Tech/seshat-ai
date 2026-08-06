package docconvert

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Fixtures here are copied from the seshat SDK's own officetext/pdftext
// testdata (real office/PDF parser fixtures, already validated there) - kept
// self-contained rather than referenced across repos so these tests still
// work in CI, which builds against the published SDK module, not a sibling
// checkout.

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read testdata/%s: %v", name, err)
	}
	return data
}

func copyToDir(t *testing.T, name, dir string) string {
	t.Helper()
	dest := filepath.Join(dir, name)
	if err := os.WriteFile(dest, readTestdata(t, name), 0o600); err != nil {
		t.Fatalf("write %s: %v", dest, err)
	}
	return dest
}

func TestConvert_DOCXNativeWithNilDoclingClient(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "sample.docx", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if !ok {
		t.Fatal("expected ok=true for a native-supported DOCX with no docling client")
	}
	if result.Source != SourceNative {
		t.Fatalf("expected SourceNative, got %q", result.Source)
	}
	if !strings.Contains(result.Markdown, "Sample Report") {
		t.Fatalf("expected extracted DOCX content, got:\n%s", result.Markdown)
	}
}

func TestConvert_XLSXNativeWithNilDoclingClient(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "sample.xlsx", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if !ok || result.Source != SourceNative {
		t.Fatalf("expected native XLSX extraction, got ok=%v source=%q", ok, result.Source)
	}
	if !strings.Contains(result.Markdown, "Carol") {
		t.Fatalf("expected extracted XLSX content, got:\n%s", result.Markdown)
	}
}

func TestConvert_PDFTextLayerNativeWithNilDoclingClient(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "text_layer.pdf", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if !ok || result.Source != SourceNative {
		t.Fatalf("expected native PDF extraction, got ok=%v source=%q", ok, result.Source)
	}
	if !strings.Contains(result.Markdown, "Sample Report") {
		t.Fatalf("expected extracted PDF content, got:\n%s", result.Markdown)
	}
}

func TestConvert_ScannedPDFWithNilDoclingClientYieldsNoResult(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := copyToDir(t, "scanned.pdf", dir)

	result, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	// No text layer and no docling client - nothing to extract, but this is
	// not an error condition (Sparse PDFs and missing docling are both
	// expected, recoverable states for callers).
	if ok {
		t.Fatalf("expected ok=false for a scanned PDF with no docling client, got markdown:\n%s", result.Markdown)
	}
}

func TestConvert_UnsupportedExtensionWithNilDoclingClientYieldsNoResult(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "notes.wav")
	if err := os.WriteFile(path, []byte("not really audio"), 0o600); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, ok, err := Convert(context.Background(), path, nil)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false for a docling-only format with no docling client")
	}
}

func TestConvertBytes_DOCXNative(t *testing.T) {
	t.Parallel()
	result, ok, err := ConvertBytes(context.Background(), readTestdata(t, "sample.docx"), "sample.docx", nil)
	if err != nil {
		t.Fatalf("ConvertBytes: %v", err)
	}
	if !ok || result.Source != SourceNative {
		t.Fatalf("expected native DOCX extraction, got ok=%v source=%q", ok, result.Source)
	}
	if !strings.Contains(result.Markdown, "Sample Report") {
		t.Fatalf("expected extracted content, got:\n%s", result.Markdown)
	}
}

func TestExtensionSetsAreDisjointAndConsistent(t *testing.T) {
	t.Parallel()
	for ext := range NativeExtensions {
		if DoclingOnlyExtensions[ext] {
			t.Errorf("%q is in both NativeExtensions and DoclingOnlyExtensions", ext)
		}
		if !AllConvertibleExtensions[ext] {
			t.Errorf("%q from NativeExtensions is missing from AllConvertibleExtensions", ext)
		}
	}
	for ext := range DoclingOnlyExtensions {
		if !AllConvertibleExtensions[ext] {
			t.Errorf("%q from DoclingOnlyExtensions is missing from AllConvertibleExtensions", ext)
		}
	}
	if !AllConvertibleExtensions[".pdf"] {
		t.Error(`".pdf" must be in AllConvertibleExtensions`)
	}
}
