package connectors

import "testing"

func TestIsAllowedS3Key(t *testing.T) {
	cases := []struct {
		key  string
		want bool
	}{
		{"report.pdf", true},
		{"notes.docx", true},
		{"deck.pptx", true},
		{"readme.txt", true},
		{"notes.md", true},
		{"script.py", false},
		{"data.json", false},
		{"export.csv", false},
		{"sheet.xlsx", false},
		{"folder/", false},
		{"noextension", false},
	}
	for _, tc := range cases {
		if got := isAllowedS3Key(tc.key); got != tc.want {
			t.Errorf("isAllowedS3Key(%q) = %v, want %v", tc.key, got, tc.want)
		}
	}
}

func TestParseS3AccountConfigRequiresBucketAndEndpoint(t *testing.T) {
	if _, err := parseS3AccountConfig(""); err == nil {
		t.Fatal("expected empty config to be rejected")
	}
	if _, err := parseS3AccountConfig(`{"region":"us-east-1"}`); err == nil {
		t.Fatal("expected config missing bucket/endpoint to be rejected")
	}
	cfg, err := parseS3AccountConfig(`{"bucket":"b","endpoint":"http://localhost:9000"}`)
	if err != nil {
		t.Fatalf("expected minimal valid config to parse: %v", err)
	}
	if cfg.Region != "us-east-1" {
		t.Fatalf("expected default region to be filled in, got %q", cfg.Region)
	}
}

func TestEncodeS3AccountConfigRoundTrips(t *testing.T) {
	encoded, err := encodeS3AccountConfig("my-bucket", "eu-west-1", "https://s3.example.com", "docs/")
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	cfg, err := parseS3AccountConfig(encoded)
	if err != nil {
		t.Fatalf("parse encoded config: %v", err)
	}
	if cfg.Bucket != "my-bucket" || cfg.Region != "eu-west-1" || cfg.Endpoint != "https://s3.example.com" || cfg.Prefix != "docs/" {
		t.Fatalf("round trip mismatch: %+v", cfg)
	}
}
