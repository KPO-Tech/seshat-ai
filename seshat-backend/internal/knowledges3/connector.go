// Package knowledges3 implements connector.KnowledgeConnector for any
// S3-compatible object store (AWS S3, MinIO, Cloudflare R2, Backblaze B2 -
// anything speaking the S3 REST API against a configurable endpoint) -
// structurally mirrors internal/knowledgegdrive (see helps/roadmap.md
// Phase 3, "deuxième connecteur Knowledge"), the second concrete proof that
// connector.KnowledgeConnector generalizes beyond one source.
//
// Unlike Drive, S3 has no "changes" API to page through - Sync's cursor is
// instead an RFC3339 timestamp: a full ListObjectsV2 pass every time,
// filtered to objects whose LastModified is after the cursor. See Sync's
// doc comment for why the returned cursor is captured before listing
// starts, mirroring Drive's GetStartPageToken-before-listing precaution.
package knowledges3

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
)

const Kind connector.Kind = "s3"

// allowedExtensions is the same business-document allowlist as
// internal/knowledgegdrive's, for the same reasons (see that package's own
// doc comment on allowedExtensions): no source/notebook code, no
// spreadsheets/tabular exports - structured data is a database/BI concern,
// not RAG's. Duplicated here rather than shared from a common package: no
// such package exists yet, and 8 lines don't justify inventing one now.
var allowedExtensions = map[string]bool{
	".pdf":  true,
	".doc":  true,
	".docx": true,
	".ppt":  true,
	".pptx": true,
	".txt":  true,
	".md":   true,
}

func isAllowedKey(key string) bool {
	if strings.HasSuffix(key, "/") {
		return false // a folder marker, not an object with content
	}
	return allowedExtensions[strings.ToLower(path.Ext(key))]
}

// maxObjectBytes bounds a single object's downloaded content - same cap and
// reasoning as knowledgegdrive.maxFileBytes.
const maxObjectBytes = 20 * 1024 * 1024 // 20MB

// AccountConfig is the non-secret connection config for one connected
// account, JSON-encoded into connector.Account.Config (in turn sourced from
// db.ConnectorAccount.Scope - see that field's doc comment and
// connector.Account.Config's). Bucket/region/endpoint/prefix aren't
// secrets, so they don't belong in connector.Secret - AccessToken holds the
// S3 access key ID there, RefreshToken the secret access key, a deliberate
// reinterpretation of those two generically-named fields.
type AccountConfig struct {
	Bucket   string `json:"bucket"`
	Region   string `json:"region"`
	Endpoint string `json:"endpoint"`
	Prefix   string `json:"prefix"`
}

// ParseAccountConfig decodes an Account.Config string into its S3 config -
// exported so the API layer can validate a connect request's config shape
// using the same rules Discover/Sync will apply.
func ParseAccountConfig(config string) (AccountConfig, error) {
	var cfg AccountConfig
	if strings.TrimSpace(config) == "" {
		return cfg, fmt.Errorf("s3 account config is missing (bucket/region/endpoint)")
	}
	if err := json.Unmarshal([]byte(config), &cfg); err != nil {
		return cfg, fmt.Errorf("invalid s3 account config: %w", err)
	}
	if cfg.Bucket == "" || cfg.Endpoint == "" {
		return cfg, fmt.Errorf("s3 account config requires at least bucket and endpoint")
	}
	if cfg.Region == "" {
		cfg.Region = "us-east-1" // AWS SDK requires a non-empty region even for non-AWS endpoints
	}
	return cfg, nil
}

// EncodeAccountConfig is ParseAccountConfig's inverse, for the API layer to
// build the Account.Config value it stores at connect time.
func EncodeAccountConfig(bucket, region, endpoint, prefix string) (string, error) {
	data, err := json.Marshal(AccountConfig{Bucket: bucket, Region: region, Endpoint: endpoint, Prefix: prefix})
	if err != nil {
		return "", err
	}
	return string(data), nil
}

type Connector struct {
	// extractText mirrors knowledgegdrive.Connector's field exactly - see
	// its doc comment. Wired via WithTextExtractor, normally to
	// knowledge.Service.ExtractText.
	extractText func(ctx context.Context, data []byte, contentType, filename string) string
}

func NewConnector() *Connector {
	return &Connector{}
}

func (c *Connector) WithTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *Connector {
	c.extractText = fn
	return c
}

func (c *Connector) Kind() connector.Kind { return Kind }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityKnowledge}
}

// client builds an S3 client for one call, using the connected account's
// own static credentials and endpoint - not a shared/cached client, since
// each account can point at a different bucket/region/endpoint entirely.
// Mirrors the AWS SDK wiring in seshat/internal/storage/s3.go's
// NewS3ProviderWithConfig (BaseEndpoint + UsePathStyle for S3-compatible,
// non-AWS providers) without reusing that type directly - S3Provider is
// built for one fixed app-level bucket/credential pair, not a per-account
// client.
func (c *Connector) client(ctx context.Context, secret connector.Secret, cfg AccountConfig) (*s3.Client, error) {
	if secret.AccessToken == "" || secret.RefreshToken == "" {
		return nil, fmt.Errorf("s3 account is missing access key credentials")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			secret.AccessToken, secret.RefreshToken, "",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	return s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true
	}), nil
}

func prefixArg(cfg AccountConfig) *string {
	if cfg.Prefix == "" {
		return nil
	}
	return aws.String(cfg.Prefix)
}

// Discover lists objects in the account's bucket without downloading
// content - a lightweight preview of what a Sync would pull in.
func (c *Connector) Discover(ctx context.Context, account connector.Account, secret connector.Secret) ([]connector.ResourceRef, error) {
	cfg, err := ParseAccountConfig(account.Config)
	if err != nil {
		return nil, err
	}
	cl, err := c.client(ctx, secret, cfg)
	if err != nil {
		return nil, err
	}

	var refs []connector.ResourceRef
	err = c.listObjects(ctx, cl, cfg, func(obj types.Object) {
		key := aws.ToString(obj.Key)
		if !isAllowedKey(key) {
			return
		}
		refs = append(refs, objectToResourceRef(obj))
	})
	if err != nil {
		return nil, err
	}
	return refs, nil
}

// Sync bootstraps (cursor == "") by listing and downloading every allowed
// object, or (cursor != "", an RFC3339 timestamp) re-lists everything but
// only downloads objects modified after the cursor - S3 has no
// change-feed API comparable to Drive's, so incrementality here means
// "re-list, filter by LastModified" rather than "resume a change stream".
// The returned cursor is captured before listing starts (same reasoning as
// knowledgegdrive's bootstrapSync capturing Drive's start page token first)
// so an object modified mid-sync isn't missed by the next incremental run.
func (c *Connector) Sync(ctx context.Context, account connector.Account, secret connector.Secret, cursor string) ([]connector.SyncItem, string, error) {
	cfg, err := ParseAccountConfig(account.Config)
	if err != nil {
		return nil, "", err
	}
	cl, err := c.client(ctx, secret, cfg)
	if err != nil {
		return nil, "", err
	}

	var since time.Time
	if cursor != "" {
		// RFC3339Nano, not RFC3339: the plain form truncates to whole
		// seconds, which is precise enough to lose real ordering
		// information between an object's LastModified and this cursor
		// when they land in the same second (found via a real MinIO test -
		// a same-second race made an unchanged object look "still new"
		// forever, since the truncated cursor could equal or trail the
		// object's own truncated-by-nothing timestamp).
		since, err = time.Parse(time.RFC3339Nano, cursor)
		if err != nil {
			return nil, "", fmt.Errorf("invalid sync cursor: %w", err)
		}
	}
	nextCursor := time.Now().UTC().Format(time.RFC3339Nano)

	var items []connector.SyncItem
	err = c.listObjects(ctx, cl, cfg, func(obj types.Object) {
		key := aws.ToString(obj.Key)
		if !isAllowedKey(key) {
			return
		}
		modified := aws.ToTime(obj.LastModified)
		if !since.IsZero() && !modified.After(since) {
			return
		}
		if item, ok := c.syncOneObject(ctx, cl, cfg, obj); ok {
			items = append(items, item)
		}
	})
	if err != nil {
		return nil, "", err
	}
	return items, nextCursor, nil
}

// listObjects pages through every object under the account's configured
// prefix, invoking visit for each one - shared by Discover and Sync so the
// pagination logic (and its filtering-before-visit contract) lives in one
// place.
func (c *Connector) listObjects(ctx context.Context, cl *s3.Client, cfg AccountConfig, visit func(types.Object)) error {
	var continuationToken *string
	for {
		out, err := cl.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(cfg.Bucket),
			Prefix:            prefixArg(cfg),
			ContinuationToken: continuationToken,
		})
		if err != nil {
			return fmt.Errorf("list s3 objects: %w", err)
		}
		for _, obj := range out.Contents {
			visit(obj)
		}
		if out.IsTruncated == nil || !*out.IsTruncated || out.NextContinuationToken == nil {
			break
		}
		continuationToken = out.NextContinuationToken
	}
	return nil
}

// syncOneObject downloads and extracts one object's content. ok=false is a
// normal skip (over maxObjectBytes, download failure, empty extracted
// text), not an error - mirrors knowledgegdrive.syncOneFile's contract.
func (c *Connector) syncOneObject(ctx context.Context, cl *s3.Client, cfg AccountConfig, obj types.Object) (connector.SyncItem, bool) {
	if obj.Size != nil && *obj.Size > maxObjectBytes {
		return connector.SyncItem{}, false
	}
	key := aws.ToString(obj.Key)
	out, err := cl.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(cfg.Bucket), Key: aws.String(key)})
	if err != nil || out == nil || out.Body == nil {
		return connector.SyncItem{}, false
	}
	defer out.Body.Close()
	data, err := io.ReadAll(io.LimitReader(out.Body, maxObjectBytes))
	if err != nil || len(data) == 0 {
		return connector.SyncItem{}, false
	}

	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	text := string(data)
	if c.extractText != nil {
		text = c.extractText(ctx, data, contentType, path.Base(key))
		if strings.TrimSpace(text) == "" {
			return connector.SyncItem{}, false
		}
	}

	return connector.SyncItem{
		ResourceRef: objectToResourceRef(obj),
		Text:        text,
		// No per-object ACL: S3-compatible providers don't have a portable,
		// reliable per-object permission model across implementations (AWS
		// ACLs, MinIO/R2 often without ACL API support at all) - nil falls
		// back to the corpus's own scope, already the documented default
		// (see connector.SyncItem.AccessControl's doc comment).
		AccessControl: nil,
	}, true
}

func objectToResourceRef(obj types.Object) connector.ResourceRef {
	key := aws.ToString(obj.Key)
	return connector.ResourceRef{
		ID:       key,
		Name:     path.Base(key),
		Kind:     "file",
		Modified: aws.ToTime(obj.LastModified),
	}
}

var _ connector.KnowledgeConnector = (*Connector)(nil)
