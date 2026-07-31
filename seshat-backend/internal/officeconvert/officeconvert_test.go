package officeconvert

import (
	"context"
	"testing"
)

// unavailableConverter returns a Converter whose binary resolution is
// forced to "not found" without touching any real LibreOffice install on
// the machine running the test - resolve()'s sync.Once is pre-fired with a
// no-op, so it never calls the real findSoffice().
func unavailableConverter() *Converter {
	c := &Converter{}
	c.once.Do(func() {})
	return c
}

func TestIsAvailableFalseWhenBinaryNotFound(t *testing.T) {
	c := unavailableConverter()
	if c.IsAvailable() {
		t.Fatal("expected IsAvailable() to be false when no binary is resolved")
	}
}

func TestConvertToPDFErrorsWhenBinaryNotFound(t *testing.T) {
	c := unavailableConverter()
	_, err := c.ConvertToPDF(context.Background(), "in.docx", t.TempDir())
	if err == nil {
		t.Fatal("expected an error when no binary is resolved, got nil")
	}
}
