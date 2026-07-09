package engine

import (
	"math"
	"strconv"
	"time"

	"github.com/user/nt/internal/model"
)

type SignalValidator struct{}

func NewSignalValidator() *SignalValidator {
	return &SignalValidator{}
}

// ValidatePending checks each pending signal against the current price
// and determines if it should transition to confirmed, invalidated, or expired.
func (v *SignalValidator) ValidatePending(signals []model.StrategySignal, currentPrice float64, gridStep float64) []validationResult {
	results := []validationResult{}
	now := time.Now()

	for _, sig := range signals {
		if sig.ValidationStatus != "pending" {
			continue
		}

		// Give user time to see the signal before auto-validating
		if now.Sub(sig.CreatedAt) < 60*time.Second {
			continue
		}

		signalPrice, _ := parseFloatStr(sig.GridLevelPrice)
		if signalPrice == 0 {
			continue
		}

		// Calculate move since signal
		movePct := ((currentPrice - signalPrice) / signalPrice) * 100
		moveGridSteps := math.Abs(currentPrice-signalPrice) / gridStep

		// Track max favorable/adverse
		// (simplified: we track current move as max since we don't persist max per tick)
		favPct := movePct
		advPct := 0.0
		favGrid := 0.0
		advGrid := 0.0
		if sig.SignalType == "buy" {
			// favorable = price goes up, adverse = price goes down
			if movePct < 0 {
				advPct = math.Abs(movePct)
				advGrid = moveGridSteps
				favPct = 0
			} else {
				favGrid = moveGridSteps
			}
		} else {
			// for sell: favorable = price goes down
			favPct = -movePct
			if movePct > 0 {
				advPct = movePct
				advGrid = moveGridSteps
				favPct = 0
			} else {
				favGrid = moveGridSteps
			}
		}

		// Check expiry
		windowDuration := time.Duration(sig.ValidationWindowMinutes) * time.Minute
		if now.Sub(sig.CreatedAt) >= windowDuration {
			results = append(results, validationResult{
				signalID:        sig.ID,
				status:          "expired",
				resultPct:       movePct,
				resultGridSteps: moveGridSteps,
				maxFavPct:       favPct,
				maxAdvPct:       advPct,
				maxFavGrid:      favGrid,
				maxAdvGrid:      advGrid,
				note:            "validation window expired",
			})
			continue
		}

		// Check target hit
		targetHit := false
		invalidHit := false

		if sig.ValidationMode == "percent" {
			if favPct >= sig.ValidationTargetValue {
				targetHit = true
			}
			if advPct >= sig.ValidationInvalidValue {
				invalidHit = true
			}
		} else {
			// grid_steps mode
			if favGrid >= sig.ValidationTargetValue {
				targetHit = true
			}
			if advGrid >= sig.ValidationInvalidValue {
				invalidHit = true
			}
		}

		if targetHit {
			resultPct := favPct
			if sig.SignalType == "sell" {
				resultPct = math.Abs(movePct)
			}
			results = append(results, validationResult{
				signalID:        sig.ID,
				status:          "confirmed",
				resultPct:       resultPct,
				resultGridSteps: moveGridSteps,
				maxFavPct:       favPct,
				maxAdvPct:       advPct,
				maxFavGrid:      favGrid,
				maxAdvGrid:      advGrid,
				note:            "target reached",
			})
		} else if invalidHit {
			results = append(results, validationResult{
				signalID:        sig.ID,
				status:          "invalidated",
				resultPct:       movePct,
				resultGridSteps: moveGridSteps,
				maxFavPct:       favPct,
				maxAdvPct:       advPct,
				maxFavGrid:      favGrid,
				maxAdvGrid:      advGrid,
				note:            "invalid threshold reached",
			})
		}
	}

	return results
}

type validationResult struct {
	signalID        int64
	status          string
	resultPct       float64
	resultGridSteps float64
	maxFavPct       float64
	maxAdvPct       float64
	maxFavGrid      float64
	maxAdvGrid      float64
	note            string
}

func parseFloatStr(s string) (float64, error) {
	return strconv.ParseFloat(s, 64)
}

// TrendValidator validates pending trend signals against percent + SMA hold rules.
type TrendValidator struct{}

func NewTrendValidator() *TrendValidator {
	return &TrendValidator{}
}

// ValidatePendingTrend evaluates pending trend signals.
// currentPrice is the latest candle close.
// smaFast and smaSlow are the current SMA values computed on the latest batch.
func (v *TrendValidator) ValidatePendingTrend(
	pending []model.StrategySignal,
	currentPrice float64,
	smaFast float64, smaSlow float64,
) []validationResult {
	results := []validationResult{}
	now := time.Now()

	for _, sig := range pending {
		if sig.ValidationStatus != "pending" {
			continue
		}
		// 60-second grace period before auto-validating (matches grid validator)
		if now.Sub(sig.CreatedAt) < 60*time.Second {
			continue
		}

		signalPrice, err := parseFloatStr(sig.GridLevelPrice)
		if err != nil || signalPrice == 0 {
			continue
		}

		movePct := ((currentPrice - signalPrice) / signalPrice) * 100

		var favPct, advPct float64
		smaHeld := false
		if sig.SignalType == "buy" {
			favPct = movePct
			if movePct < 0 {
				advPct = -movePct
				favPct = 0
			}
			smaHeld = smaFast > smaSlow
		} else {
			favPct = -movePct
			if movePct > 0 {
				advPct = movePct
				favPct = 0
			}
			smaHeld = smaFast < smaSlow
		}

		windowDuration := time.Duration(sig.ValidationWindowMinutes) * time.Minute
		if now.Sub(sig.CreatedAt) >= windowDuration {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "expired",
				resultPct: movePct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "validation window expired",
			})
			continue
		}

		targetHit := favPct >= sig.ValidationTargetValue
		invalidHit := advPct >= sig.ValidationInvalidValue

		if targetHit && smaHeld {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "confirmed",
				resultPct: favPct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "target reached",
			})
			continue
		}
		if targetHit && !smaHeld {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "invalidated",
				resultPct: movePct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "percent hit but SMA reversed",
			})
			continue
		}
		if invalidHit {
			results = append(results, validationResult{
				signalID:  sig.ID,
				status:    "invalidated",
				resultPct: movePct,
				maxFavPct: favPct,
				maxAdvPct: advPct,
				note:      "invalid threshold reached",
			})
			continue
		}
	}
	return results
}