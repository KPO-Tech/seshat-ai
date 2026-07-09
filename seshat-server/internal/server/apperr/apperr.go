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
