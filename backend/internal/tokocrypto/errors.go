package tokocrypto

import (
	"errors"
	"fmt"
)

// HTTPError is returned when Tokocrypto responds with a non-200 HTTP status.
type HTTPError struct {
	StatusCode int
	Status     string
	Body       string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("tokocrypto HTTP error: %s %s", e.Status, e.Body)
}

// APIError is returned when Tokocrypto returns HTTP 200 with a non-zero code.
type APIError struct {
	Code    int
	Message string
	Body    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("tokocrypto error code %d: %s", e.Code, e.Message)
}

// IsDefiniteOrderRejection reports whether an order placement error means the
// request was rejected before an order could become live on the exchange.
func IsDefiniteOrderRejection(err error) bool {
	if err == nil {
		return false
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return true
	}
	var httpErr *HTTPError
	if errors.As(err, &httpErr) {
		return httpErr.StatusCode >= 400 && httpErr.StatusCode < 500
	}
	return false
}
