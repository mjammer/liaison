package controlplane

import (
	"errors"
	"fmt"
	"net/http"

	"gorm.io/gorm"
)

// errForbidden is returned when a request targets a resource owned by
// another user. HTTP handlers map this to 403.
var errForbidden = errors.New("forbidden")

// ErrForbidden returns the sentinel used for cross-user access denials, for
// callers outside this package that need errors.Is matching.
func ErrForbidden() error { return errForbidden }

// HTTPError marks an expected control-plane failure that should be rendered as
// a concrete client-facing HTTP status instead of falling through as 500.
type HTTPError struct {
	status  int
	reason  string
	message string
	cause   error
}

func (e *HTTPError) Error() string {
	if e == nil {
		return ""
	}
	if e.cause != nil {
		return fmt.Sprintf("%s: %v", e.message, e.cause)
	}
	return e.message
}

func (e *HTTPError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.cause
}

func (e *HTTPError) Status() int {
	if e == nil || e.status == 0 {
		return http.StatusInternalServerError
	}
	return e.status
}

func (e *HTTPError) Reason() string {
	if e == nil || e.reason == "" {
		return "CONTROL_PLANE_ERROR"
	}
	return e.reason
}

func (e *HTTPError) Message() string {
	if e == nil {
		return ""
	}
	return e.message
}

func badRequest(reason, message string) error {
	return &HTTPError{status: http.StatusBadRequest, reason: reason, message: message}
}

func notFound(reason, message string, cause error) error {
	return &HTTPError{status: http.StatusNotFound, reason: reason, message: message, cause: cause}
}

func conflict(reason, message string) error {
	return &HTTPError{status: http.StatusConflict, reason: reason, message: message}
}

func preconditionFailed(reason, message string) error {
	return &HTTPError{status: http.StatusPreconditionFailed, reason: reason, message: message}
}

func isRecordNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}

func mapRecordNotFound(err error, reason, message string) error {
	if isRecordNotFound(err) {
		return notFound(reason, message, err)
	}
	return err
}
