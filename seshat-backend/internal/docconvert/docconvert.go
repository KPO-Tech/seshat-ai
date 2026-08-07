// Package docconvert is the single place seshat-backend decides how to turn
// an uploaded file's bytes into markdown text - for the upload sidecar
// preview (files.Service.UploadSessionFile) and for RAG ingestion
// (knowledge.Service). Before this package existed, both call sites (plus
// query/context.go's prompt annotation) maintained their own near-duplicate
// extension lists and always went straight to docling-serve, even for
// formats (DOCX/PPTX/XLSX, and PDFs with a real text layer) that need no
// OCR/ML at all. Convert tries the seshat SDK's native, dependency-free
// extractors first and only reaches for docling when a format genuinely
// needs it (scans, audio, images).
package docconvert

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/ledongthuc/pdf"

	"github.com/KPO-Tech/seshat/pkg/docling"
	"github.com/KPO-Tech/seshat/pkg/officetext"
	"github.com/KPO-Tech/seshat/pkg/pdftext"
	"github.com/KPO-Tech/seshat/pkg/textquality"
)

// NativeExtensions lists formats converted locally, no docling-serve needed.
var NativeExtensions = officetext.SupportedExtensions // .docx .pptx .xlsx

// DoclingOnlyExtensions lists formats that always need docling-serve: audio
// transcription and image OCR have no native equivalent here. PDF is
// intentionally absent - it's handled by Convert's own native-first/docling-
// fallback logic below, not a blanket "always try docling" entry, since most
// PDFs have a real text layer and need no OCR at all.
var DoclingOnlyExtensions = map[string]bool{
	".wav":  true,
	".mp3":  true,
	".png":  true,
	".tiff": true,
	".tif":  true,
	".jpeg": true,
	".jpg":  true,
}

// AllConvertibleExtensions is every extension Convert can turn into markdown
// given a reachable docling client - native formats, PDF, and the
// docling-only formats. Callers that need "is this worth attempting at all"
// (e.g. the upload-time conversion gate, the prompt annotation) should use
// this rather than re-deriving their own list.
var AllConvertibleExtensions = buildAllConvertibleExtensions()

func buildAllConvertibleExtensions() map[string]bool {
	all := map[string]bool{".pdf": true}
	for ext := range NativeExtensions {
		all[ext] = true
	}
	for ext := range DoclingOnlyExtensions {
		all[ext] = true
	}
	return all
}

// Source identifies which engine produced a Result's markdown.
type Source string

const (
	SourceNative  Source = "native"
	SourceDocling Source = "docling"
)

// Result is the outcome of a successful conversion.
type Result struct {
	Markdown string
	Images   []docling.ExtractedImage
	Source   Source
}

// Convert turns filePath's content into markdown. It tries native extraction
// first for DOCX/PPTX/XLSX (always) and PDF (only when *every* page has a
// real text layer - see pdfEveryPageHasText), then falls back to
// doclingClient (which may be nil) for everything else: scans, audio,
// images, a PDF where even one page looks like it needs OCR, and any
// native-extraction failure. ok is false when no path could produce text -
// callers should not treat that as an error, just "nothing extracted".
func Convert(ctx context.Context, filePath string, doclingClient *docling.Client) (Result, bool, error) {
	ext := strings.ToLower(filepath.Ext(filePath))

	if NativeExtensions[ext] {
		if data, err := os.ReadFile(filePath); err == nil {
			if md, ok, sparse, extractErr := officetext.Extract(filePath, data); ok && extractErr == nil && !sparse && !textquality.IsGarbledText(md) {
				return Result{Markdown: md, Source: SourceNative}, true, nil
			}
		}
		// Read failure, a corrupt file, or an office document extraction
		// deemed too thin to trust (e.g. a PPTX that's mostly images) -
		// fall through to docling below, which may still salvage something.
	}

	if ext == ".pdf" {
		if data, err := os.ReadFile(filePath); err == nil {
			if allPagesHaveText, ok := pdfEveryPageHasText(data); ok && allPagesHaveText {
				if native, extractErr := pdftext.Extract(data); extractErr == nil && !native.Sparse {
					return Result{Markdown: native.Text, Source: SourceNative}, true, nil
				}
			}
		}
	}

	if doclingClient == nil || !doclingClient.IsAvailable(ctx) {
		return Result{}, false, nil
	}

	conversion, err := doclingClient.ConvertFile(ctx, filePath)
	if err != nil {
		return Result{}, false, err
	}
	if strings.TrimSpace(conversion.Markdown) == "" {
		return Result{}, false, nil
	}
	// Rare, but a real failure mode worth guarding: docling itself
	// producing garbled output (e.g. a broken embedded font it couldn't
	// OCR around). Treat it the same as empty - "nothing usable came out
	// of this" - rather than silently returning bad text as if it succeeded.
	if textquality.IsGarbledText(conversion.Markdown) {
		return Result{}, false, nil
	}
	return Result{Markdown: conversion.Markdown, Images: conversion.Images, Source: SourceDocling}, true, nil
}

// ConvertBytes is Convert's counterpart for callers that only have the raw
// bytes and a filename, not a path on disk (e.g. RAG ingestion, which reads
// blobs out of storage rather than the workspace filesystem).
func ConvertBytes(ctx context.Context, data []byte, filename string, doclingClient *docling.Client) (Result, bool, error) {
	ext := strings.ToLower(filepath.Ext(filename))

	if NativeExtensions[ext] {
		if md, ok, sparse, extractErr := officetext.Extract(filename, data); ok && extractErr == nil && !sparse && !textquality.IsGarbledText(md) {
			return Result{Markdown: md, Source: SourceNative}, true, nil
		}
	}

	if ext == ".pdf" {
		if allPagesHaveText, ok := pdfEveryPageHasText(data); ok && allPagesHaveText {
			if native, extractErr := pdftext.Extract(data); extractErr == nil && !native.Sparse {
				return Result{Markdown: native.Text, Source: SourceNative}, true, nil
			}
		}
	}

	if doclingClient == nil || !doclingClient.IsAvailable(ctx) {
		return Result{}, false, nil
	}

	conversion, err := doclingClient.ConvertBytes(ctx, data, filename)
	if err != nil {
		return Result{}, false, err
	}
	if strings.TrimSpace(conversion.Markdown) == "" {
		return Result{}, false, nil
	}
	// Rare, but a real failure mode worth guarding: docling itself
	// producing garbled output (e.g. a broken embedded font it couldn't
	// OCR around). Treat it the same as empty - "nothing usable came out
	// of this" - rather than silently returning bad text as if it succeeded.
	if textquality.IsGarbledText(conversion.Markdown) {
		return Result{}, false, nil
	}
	return Result{Markdown: conversion.Markdown, Images: conversion.Images, Source: SourceDocling}, true, nil
}

// pdfEveryPageHasText re-scans the PDF page by page (pdftext.Extract only
// exposes a whole-document average - a handful of scanned/diagram pages in
// an otherwise text-heavy document can stay hidden under that average, and
// image-only pages silently drop their content since native extraction
// can't read images) using the same underlying parser pdftext itself wraps.
// Also rejects a page whose text is merely long enough but not actually
// usable - see textquality.IsGarbledText - which a character-count check
// alone can't catch (a broken font's ToUnicode map can still yield plenty
// of characters per page, just not real ones).
// ok is false when the PDF can't be parsed at all - callers should treat
// that as "can't tell, let docling have a look" the same as a sparse page,
// not as "assume it's fine."
func pdfEveryPageHasText(data []byte) (allPagesHaveText bool, ok bool) {
	r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return false, false
	}
	pageCount := r.NumPage()
	if pageCount == 0 {
		return false, false
	}
	for i := 1; i <= pageCount; i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			return false, true
		}
		text, err := page.GetPlainText(nil)
		if err != nil || len(strings.TrimSpace(text)) < pdftext.MinCharsPerPage || textquality.IsGarbledText(text) {
			return false, true
		}
	}
	return true, true
}
