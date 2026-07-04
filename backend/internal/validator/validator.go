package validator

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

func Required(s string) error {
	if strings.TrimSpace(s) == "" {
		return errors.New("field is required")
	}
	return nil
}

func MinLength(s string, min int) error {
	if len(s) < min {
		return fmt.Errorf("minimum %d characters", min)
	}
	return nil
}

func MaxLength(s string, max int) error {
	if len(s) > max {
		return fmt.Errorf("maximum %d characters", max)
	}
	return nil
}

func In(s string, valid []string) error {
	for _, v := range valid {
		if s == v {
			return nil
		}
	}
	return fmt.Errorf("must be one of: %s", strings.Join(valid, ", "))
}

func PosFloat(s string) error {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return errors.New("must be a valid number")
	}
	if v <= 0 {
		return errors.New("must be greater than 0")
	}
	return nil
}

func PosInt(s string) error {
	v, err := strconv.Atoi(s)
	if err != nil {
		return errors.New("must be a valid integer")
	}
	if v <= 0 {
		return errors.New("must be greater than 0")
	}
	return nil
}

func RangeFloat(s string, min, max float64) error {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return errors.New("must be a valid number")
	}
	if v < min || v > max {
		return fmt.Errorf("must be between %.0f and %.0f", min, max)
	}
	return nil
}

func Symbol(s string) error {
	parts := strings.Split(s, "_")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return errors.New("must be in format BASE_QUOTE (e.g. BTC_USDT)")
	}
	return nil
}

func JSONStr(s string) error {
	if s == "" {
		return nil
	}
	var js any
	if err := json.Unmarshal([]byte(s), &js); err != nil {
		return errors.New("must be valid JSON")
	}
	return nil
}

type Errors []string

func (e *Errors) Add(err error) {
	if err != nil {
		*e = append(*e, err.Error())
	}
}

func (e Errors) Err() error {
	if len(e) == 0 {
		return nil
	}
	return fmt.Errorf("validation failed: %s", strings.Join(e, "; "))
}
