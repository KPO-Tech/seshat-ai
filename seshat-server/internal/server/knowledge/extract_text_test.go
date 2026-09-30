package knowledge

import "testing"

// Regression test for the bug found in production: isPrintable used "r >=
// 32" on runes decoded from arbitrary bytes, and Go's string ranging
// replaces invalid UTF-8 with U+FFFD (>= 32) rather than erroring - so raw
// binary scored as ~100% "printable" and got silently indexed as if it
// were the document's real extracted text. A PDF's own header/compressed
// stream bytes are exactly this case.
func TestIsPrintable_RejectsRawBinaryData(t *testing.T) {
	pdfLikeBinary := []byte("%PDF-1.4\n%\xc7\xec\x8f\xa2\n5 0 obj\n<</Length 6 0 R/Filter /FlateDecode>>\nstream\nx\x9c\xed\x5a\x4b\x92\x14\x37\x10\x0d\x6f\xfb")
	if isPrintable(string(pdfLikeBinary)) {
		t.Fatal("expected raw PDF binary to be rejected as non-printable, not scored as text")
	}
}

func TestIsPrintable_AcceptsRealText(t *testing.T) {
	if !isPrintable("# Refund Policy\n\nRestocking fee is 10% for non-defective returns.") {
		t.Fatal("expected real markdown/plain text to be accepted")
	}
}

func TestExtractText_BinaryPDFBytesYieldNoTextRatherThanGarbage(t *testing.T) {
	pdfLikeBinary := []byte("%PDF-1.4\n%\xc7\xec\x8f\xa2\n5 0 obj\n<</Length 6 0 R/Filter /FlateDecode>>\nstream\nx\x9c\xed\x5a\x4b\x92\x14\x37\x10\x0d\x6f\xfb")
	got := extractText(pdfLikeBinary, "application/pdf")
	if got != "" {
		t.Fatalf("expected empty extraction for raw binary (so ingestion fails cleanly), got %d bytes", len(got))
	}
}
