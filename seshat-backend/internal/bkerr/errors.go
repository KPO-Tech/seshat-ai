package bkerr

import "errors"

type ErrorKind string

const (
	ErrorKindInvalidInput ErrorKind = "invalid_input"
	ErrorKindUnauthorized ErrorKind = "unauthorized"
	ErrorKindForbidden    ErrorKind = "forbidden"
	ErrorKindNotFound     ErrorKind = "not_found"
	ErrorKindRateLimit    ErrorKind = "rate_limit"
	ErrorKindUnavailable  ErrorKind = "unavailable"
	ErrorKindInternal     ErrorKind = "internal"
)

type Error struct {
	Kind    ErrorKind
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return string(e.Kind)
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func newError(kind ErrorKind, message string, err error) error {
	return &Error{Kind: kind, Message: message, Err: err}
}

func InvalidInput(message string, err error) error {
	return newError(ErrorKindInvalidInput, message, err)
}

func Unauthorized(message string, err error) error {
	return newError(ErrorKindUnauthorized, message, err)
}

func Forbidden(message string, err error) error {
	return newError(ErrorKindForbidden, message, err)
}

func NotFound(message string, err error) error {
	return newError(ErrorKindNotFound, message, err)
}

func RateLimit(message string, err error) error {
	return newError(ErrorKindRateLimit, message, err)
}

func Unavailable(message string, err error) error {
	return newError(ErrorKindUnavailable, message, err)
}

func Internal(message string, err error) error {
	return newError(ErrorKindInternal, message, err)
}

func KindOf(err error) ErrorKind {
	var target *Error
	if errors.As(err, &target) {
		return target.Kind
	}
	return ErrorKindInternal
}

func Message(err error) string {
	if err == nil {
		return ""
	}
	var target *Error
	if errors.As(err, &target) && target.Message != "" {
		return target.Message
	}
	return err.Error()
}
