// S3 connector: implements knowledgeConnector for any S3-compatible object
// store (AWS S3, MinIO, Cloudflare R2, Backblaze B2 - anything speaking the
// S3 REST API against a configurable endpoint). Ported from seshat-backend's
// internal/knowledges3 (see docs/architecture.md's "Example: Knowledge
// connectors") - the Discover/Sync logic is unchanged, only the account/
// secret shapes are org-scoped instead of user-scoped.
//
// Unlike Drive/SharePoint, S3 has no "changes" API to page through - Sync's
// cursor is instead an RFC3339Nano timestamp: a full ListObjectsV2 pass
// every time, filtered to objects whose LastModified is after the cursor.
package connectors

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
)

const s3Kind connectorKind = "s3"

// allowedS3Extensions is a business-document allowlist: no source/notebook
// code, no spreadsheets/tabular exports - structured data is a database/BI
// concern, not RAG's.
var allowedS3Extensions = map[string]bool{
	".pdf":  true,
	".doc":  true,
	".docx": true,
	".ppt":  true,
	".pptx": true,
	".txt":  true,
	".md":   true,
}

func isAllowedS3Key(key string) bool {
	if strings.HasSuffix(key, "/") {
		return false // a folder marker, not an object with content
	}
	return allowedS3Extensions[strings.ToLower(path.Ext(key))]
}

// maxS3ObjectBytes bounds a single object's downloaded content.
const maxS3ObjectBytes = 20 * 1024 * 1024 // 20MB

// s3AccountConfig is the non-secret connection config for one connected
// account, JSON-encoded into syncAccount.Config. Bucket/region/endpoint/
// prefix aren't secrets, so they don't belong in syncSecret - AccessToken
// holds the S3 access key ID there, RefreshToken the secret access key, a
// deliberate reinterpretation of those two generically-named fields.
type s3AccountConfig struct {
	Bucket   string `json:"bucket"`
	Region   string `json:"region"`
	Endpoint string `json:"endpoint"`
	Prefix   string `json:"prefix"`
}

// parseS3AccountConfig decodes a syncAccount.Config string into its S3
// config - used by the service layer to validate a connect request's config
// shape using the same rules Discover/Sync will apply.
func parseS3AccountConfig(config string) (s3AccountConfig, error) {
	var cfg s3AccountConfig
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

// encodeS3AccountConfig is parseS3AccountConfig's inverse, for the service
// layer to build the syncAccount.Config value it stores at connect time.
func encodeS3AccountConfig(bucket, region, endpoint, prefix string) (string, error) {
	data, err := json.Marshal(s3AccountConfig{Bucket: bucket, Region: region, Endpoint: endpoint, Prefix: prefix})
	if err != nil {
		return "", err
	}
	return string(data), nil
}

type s3Connector struct {
	// extractText is wired via withTextExtractor, normally to
	// knowledge.Service's own docling-backed extraction, so connector-synced
	// content goes through the exact same extraction path as an uploaded file.
	extractText func(ctx context.Context, data []byte, contentType, filename string) string
}

func newS3Connector() *s3Connector {
	return &s3Connector{}
}

func (c *s3Connector) withTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *s3Connector {
	c.extractText = fn
	return c
}

func (c *s3Connector) Kind() connectorKind { return s3Kind }

// client builds an S3 client for one call, using the connected account's own
// static credentials and endpoint - not a shared/cached client, since each
// account can point at a different bucket/region/endpoint entirely.
func (c *s3Connector) client(ctx context.Context, secret syncSecret, cfg s3AccountConfig) (*s3.Client, error) {
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

func s3PrefixArg(cfg s3AccountConfig) *string {
	if cfg.Prefix == "" {
		return nil
	}
	return aws.String(cfg.Prefix)
}

// Discover lists objects in the account's bucket without downloading
// content - a lightweight preview of what a Sync would pull in.
func (c *s3Connector) Discover(ctx context.Context, account syncAccount, secret syncSecret) ([]resourceRef, error) {
	cfg, err := parseS3AccountConfig(account.Config)
	if err != nil {
		return nil, err
	}
	cl, err := c.client(ctx, secret, cfg)
	if err != nil {
		return nil, err
	}

	var refs []resourceRef
	err = c.listObjects(ctx, cl, cfg, func(obj types.Object) {
		key := aws.ToString(obj.Key)
		if !isAllowedS3Key(key) {
			return
		}
		refs = append(refs, objectToS3ResourceRef(obj))
	})
	if err != nil {
		return nil, err
	}
	return refs, nil
}

// Sync bootstraps (cursor == "") by listing and downloading every allowed
// object, or (cursor != "", an RFC3339Nano timestamp) re-lists everything
// but only downloads objects modified after the cursor - S3 has no
// change-feed API, so incrementality here means "re-list, filter by
// LastModified" rather than "resume a change stream". The returned cursor
// is captured before listing starts so an object modified mid-sync isn't
// missed by the next incremental run.
func (c *s3Connector) Sync(ctx context.Context, account syncAccount, secret syncSecret, cursor string) ([]syncItem, string, error) {
	cfg, err := parseS3AccountConfig(account.Config)
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
		// seconds, precise enough to lose real ordering between an object's
		// LastModified and this cursor when they land in the same second.
		since, err = time.Parse(time.RFC3339Nano, cursor)
		if err != nil {
			return nil, "", fmt.Errorf("invalid sync cursor: %w", err)
		}
	}
	nextCursor := time.Now().UTC().Format(time.RFC3339Nano)

	var items []syncItem
	err = c.listObjects(ctx, cl, cfg, func(obj types.Object) {
		key := aws.ToString(obj.Key)
		if !isAllowedS3Key(key) {
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
// pagination logic lives in one place.
func (c *s3Connector) listObjects(ctx context.Context, cl *s3.Client, cfg s3AccountConfig, visit func(types.Object)) error {
	var continuationToken *string
	for {
		out, err := cl.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(cfg.Bucket),
			Prefix:            s3PrefixArg(cfg),
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
// normal skip (over maxS3ObjectBytes, download failure, empty extracted
// text), not an error.
func (c *s3Connector) syncOneObject(ctx context.Context, cl *s3.Client, cfg s3AccountConfig, obj types.Object) (syncItem, bool) {
	if obj.Size != nil && *obj.Size > maxS3ObjectBytes {
		return syncItem{}, false
	}
	key := aws.ToString(obj.Key)
	out, err := cl.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(cfg.Bucket), Key: aws.String(key)})
	if err != nil || out == nil || out.Body == nil {
		return syncItem{}, false
	}
	defer out.Body.Close()
	data, err := io.ReadAll(io.LimitReader(out.Body, maxS3ObjectBytes))
	if err != nil || len(data) == 0 {
		return syncItem{}, false
	}

	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	text := string(data)
	if c.extractText != nil {
		text = c.extractText(ctx, data, contentType, path.Base(key))
		if strings.TrimSpace(text) == "" {
			return syncItem{}, false
		}
	}

	return syncItem{
		resourceRef: objectToS3ResourceRef(obj),
		Text:        text,
		// No per-object ACL: S3-compatible providers don't have a portable,
		// reliable per-object permission model across implementations - nil
		// falls back to the corpus's own org-scoped permissions.
		AccessControl: nil,
	}, true
}

func objectToS3ResourceRef(obj types.Object) resourceRef {
	key := aws.ToString(obj.Key)
	return resourceRef{
		ID:       key,
		Name:     path.Base(key),
		Kind:     "file",
		Modified: aws.ToTime(obj.LastModified),
	}
}

var _ knowledgeConnector = (*s3Connector)(nil)
