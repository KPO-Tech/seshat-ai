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
	"context"
	"os"
	"path/filepath"
	"strings"

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
// first for DOCX/PPTX/XLSX (always) and PDF (when the PDF has a real text
// layer - see pdftext.Result.Sparse), then falls back to doclingClient
// (which may be nil) for everything else: scans, audio, images, and any
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
		// Read failure or a corrupt file that failed to parse - fall through
		// to docling below, which may still salvage something.
	}

	if ext == ".pdf" {
		if data, err := os.ReadFile(filePath); err == nil {
			if native, extractErr := pdftext.Extract(data); extractErr == nil && !native.Sparse {
				return Result{Markdown: native.Text, Source: SourceNative}, true, nil
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
		if native, extractErr := pdftext.Extract(data); extractErr == nil && !native.Sparse {
			return Result{Markdown: native.Text, Source: SourceNative}, true, nil
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
	return Result{Markdown: conversion.Markdown, Images: conversion.Images, Source: SourceDocling}, true, nil
}
