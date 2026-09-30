// Package apperr is the single control-plane error shape shared by iam and
// automation. Both packages re-export it under their own Err* names (kept
// for call-site compatibility), so the type only needs to be defined, and
// mapped to an HTTP status, in one place instead of two.
package apperr

import "errors"

type Error struct {
	Kind    string
	Message string
}

func (e *Error) Error() string { return e.Message }

func (e *Error) Is(target error) bool {
	var typed *Error
	if !errors.As(target, &typed) {
		return false
	}
	return e.Kind == typed.Kind
}

func InvalidInput(message string) error { return &Error{Kind: "invalid_input", Message: message} }
func Unauthorized(message string) error { return &Error{Kind: "unauthorized", Message: message} }
func Forbidden(message string) error    { return &Error{Kind: "forbidden", Message: message} }
func Conflict(message string) error     { return &Error{Kind: "conflict", Message: message} }
func NotFound(message string) error     { return &Error{Kind: "not_found", Message: message} }

// StepUpRequired means the caller is authenticated but this session hasn't
// proven fresh identity recently enough for the action attempted - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9. Distinct from
// Unauthorized (no valid session at all) and Forbidden (wrong permissions
// regardless of freshness): a client needs to tell this apart from both to
// know it should offer a re-auth prompt rather than a login screen or a
// permission-denied message.
func StepUpRequired(message string) error { return &Error{Kind: "step_up_required", Message: message} }
