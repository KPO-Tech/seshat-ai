# TODO - Document processing backend

## Decision

Build document import and document reading as a first-class backend pipeline,
separate from RAG.

RAG must consume an already-normalized document result. It should not decide how
to read PDFs, images, Office files, scanned pages, or external document-reader
providers.

Default strategy:

- Prefer local processing first.
- Use external document intelligence only when configured.
- Keep `seshat-intelligence` as the future Python/model-heavy service for OCR,
  layout analysis, table recognition, provider-specific conversion, model
  downloads, warmup, concurrency and inference management.

## Current State

### `seshat/`

- `pkg/documentreader` already provides a neutral document-reader facade.
- The generic document-reader client can target `seshat-intelligence`, Docling,
  Marker, or another compatible service.
- `pkg/nativedoc` is promising, but still opt-in through build tags, CGO and
  local model files.
- `internal/pdfsmart` is now wired into the backend PDF path for page-aware
  native/external routing.
- RAG document-aware chunking is enabled in the backend with a structured local
  fallback.

### `seshat-backend`

- `internal/documentreading` is now the central local-first/external-fallback
  policy.
- Session uploads can produce Markdown sidecars.
- Chat attachments are listed safely in context; the agent uses tools such as
  `read_file` instead of injecting full documents directly into the prompt.
- Knowledge ingestion extracts text before RAG ingestion.
- The RAG service now receives a cached document-aware chunker, so raw document
  bytes can be used for hybrid chunking when the configured reader supports it.
- Local processing currently covers basic Office extraction, text PDFs and
  page-aware PDF routing through `pdfsmart`, but does not auto-start
  `nativedoc`.

### `seshat-intelligence`

- Already has the right shape for heavy Python inference work.
- Uses process pools to keep the API event loop free and bound memory usage.
- Supports Docling and Marker conversion.
- Provides Docling hybrid chunking.
- Should later own model download/setup, warmup, latency/capability reporting,
  and high-concurrency inference management.

## Target Architecture

```text
Imported file
  -> Document processing pipeline
      -> classify file type / MIME / hash
      -> local basic extraction
      -> local advanced extraction when available
      -> external fallback when configured
      -> normalize markdown, text, assets and metadata
      -> store canonical document result
  -> Chat / read_file / Knowledge / RAG consume the same result
```

The canonical result should include:

- source file ID
- filename
- content type
- content hash
- status
- engine/source (`local-basic`, `local-native`, `pdfsmart`,
  `seshat-intelligence`, `docling`, `marker`, etc.)
- markdown
- plain text
- page count when known
- extracted assets/images when available
- warnings and errors
- creation/update timestamps

## Phase 1 - Backend Pipeline

- Status: started.
- Done:
  - Added a backend document `Processor` contract with an in-process
    canonical `ReadResult`.
  - Routed session-upload markdown sidecar generation through the processor.
  - Routed Knowledge extraction through the same processor.
  - Routed the SDK/chat `read_file` document converter through the processor.
  - Centralized plain-text detection/rejection in `internal/documentreading`.
  - Added an ArtifactStore-backed document read-result cache keyed by file ID.
  - Made Knowledge reuse cached upload/read results before attempting a fresh
    conversion.
  - Made Markdown preview fall back to the cached read result when the workspace
    sidecar is absent.
  - Added API/file metadata for document read status and engine.
  - Made chat attachment context use the computed document read status instead
    of inferring only from `markdown_path`.
  - Propagated document read status/engine through persisted chat attachments
    and the desktop attachment types/upload flow.
  - Let desktop text previews use cached document Markdown for converted
    non-native-panel attachments.
  - Added focused processor tests for plain text, binary-without-external and
    image-with-external behavior, dynamic converter resolution and read-result
    cache round-trips.
  - Added a Knowledge ingestion test proving a cached OCR/read result can ingest
    an otherwise unreadable binary/image blob.

- Create or strengthen a backend `DocumentProcessor` around
  `internal/documentreading`.
- Make session uploads, `read_file`, Markdown preview and Knowledge ingestion
  consume the same canonical document result.
- Avoid duplicate conversions between upload, chat tools and Knowledge/RAG.
- Keep local-basic processing as the default path.
- Use external conversion only when configured.
- Add focused tests for:
  - Office files
  - text PDFs
  - scanned/image-like PDFs without external service
  - image files without external service
  - external fallback
  - external-first configuration with local fallback

## Phase 2 - RAG Integration

- Status: done.
- Done:
  - Added a dynamic hybrid chunker adapter that resolves the current document
    reader settings per call.
  - Configured backend RAG ingestion with a cached structured document chunker.
  - Preserved the same document-aware chunker for per-user scoped RAG services
    used by main chat.
  - Kept local fallback behavior when no external hybrid chunk endpoint is
    available.
  - Exposed basic document capability flags through system status.
  - Surfaced local conversion, external-reader and hybrid-chunking capability
    status in the desktop Knowledge settings.
  - Extended the document-reader test endpoint with capability flags for the
    UI.
  - Made the document-reader test endpoint probe health, conversion and hybrid
    chunking separately with short timeouts and per-capability errors.
  - Cached the latest matching document-reader diagnostic in memory so
    `/system/status` can expose tested external capabilities without running
    slow probes on every settings refresh.
  - Added a Knowledge ingestion regression test proving hybrid document chunk
    metadata reaches searchable RAG results.
  - Added a Knowledge ingestion regression test proving local structured
    fallback still completes when external hybrid chunking fails.
  - Audited production `rag.NewService` construction: backend bootstrap and
    scoped chat RAG both receive the document-aware chunker; remaining nil
    chunkers are tests or non-backend paths.

- Closed criteria:
  - Extraction remains separate from RAG.
  - Normalized markdown/text feeds RAG.
  - Document-aware chunking is enabled when a compatible chunker is available.
  - Local text/heading/table fallback is used when no hybrid chunker exists or
    when hybrid chunking fails.
  - `rag.NewService` is no longer created with a nil/default chunker in the
    backend production paths where document-aware ingestion is expected.
  - Tests cover hybrid metadata propagation and external-chunking fallback.

## Phase 3 - Better Local Processing

- Status: started.
- Done:
  - Routed backend PDF conversion through `pkg/pdfsmart` so PDF handling is no
    longer all-native-or-all-external: pages that need document intelligence can
    be routed through the configured reader while simple pages stay local.
  - Kept the first Phase 3 integration conservative: no vision fallback yet and
    no implicit nativedoc startup; existing external whole-document fallback
    remains available when `pdfsmart` cannot produce a complete result.
  - Exposed local document-processing capability flags through `/system/status`:
    local basic, PDF smart, nativedoc compiled, nativedoc runtime initialized,
    nativedoc models available, nativedoc ready, and vision fallback
    configured.
  - Surfaced those local capabilities in the desktop Knowledge document-reader
    settings and summary status.
  - Added an optional local advanced reader slot in the backend document-reader
    policy. When the backend is compiled with nativedoc, ONNX Runtime is already
    initialized, and the DeepDoc model files exist, `nativedoc` is tried before
    the external reader in local-first mode. In external-first mode, it remains
    the local fallback after the external reader fails or returns unusable text.
  - Kept nativedoc opt-in: the backend does not implicitly initialize ONNX
    Runtime or download/start models during normal desktop startup.
  - Added an explicit native OCR initialization action:
    `POST /settings/document-reader/native/init`. It validates build/runtime
    prerequisites, initializes ONNX Runtime only when the user triggers it, and
    returns capability flags for the UI.
  - Added a desktop Knowledge settings button to initialize native OCR when the
    backend is compiled with nativedoc and DeepDoc models are present.
  - Added the local DeepDoc model download flow for desktop/local usage:
    `GET /settings/document-reader/native/status` reports model/job/capability
    state, and `POST /settings/document-reader/native/download` starts an
    in-process download job into `SESHAT_RUNTIME_ROOT/models/deepdoc` (or
    `SESHAT_NATIVEDOC_MODELS_DIR`). The desktop UI can start the job and poll
    progress.
  - Made the desktop Knowledge UI load native OCR status on open, show the
    model directory, resume polling when a download is already running, and
    display per-file byte progress.

- Wire `internal/pdfsmart` from `seshat/` into backend policy.
- Add optional `nativedoc` support behind explicit build/runtime capability.
- Expose local capability status clearly:
  - local basic available
  - local advanced unavailable
  - models missing
  - runtime missing
  - ready
  - failed
- Do not block the default app experience on advanced local models.

## Phase 4 - External Intelligence

- Keep `seshat-intelligence` as the recommended heavy document-intelligence
  server.
- Later add:
  - model download/install flows
  - model warmup
  - provider capability reporting
  - health and latency reporting
  - queue/job status for long-running conversions
  - configurable providers: Docling, Marker, Seshat native intelligence, custom

## Immediate Next Step

Start with Phase 1 in `seshat-backend`:

1. Define the backend document-processing contract.
2. Centralize the canonical result.
3. Route upload, chat file reading, Markdown preview and Knowledge ingestion
   through that contract.
4. Leave model installation and advanced inference for a later pass.
