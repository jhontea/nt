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
		if sig.SignalType == "buy" {
			// favorable = price goes up, adverse = price goes down
			if movePct < 0 {
				advPct = math.Abs(movePct)
				favPct = 0
			}
		} else {
			// for sell: favorable = price goes down
			favPct = -movePct
			if movePct > 0 {
				advPct = movePct
				favPct = 0
			}
		}

		favGrid := math.Abs(currentPrice-signalPrice) / gridStep

		// Check expiry
		windowDuration := time.Duration(sig.ValidationWindowMinutes) * time.Minute
		if now.Sub(sig.CreatedAt) >= windowDuration {
			results = append(results, validationResult{
				signalID:         sig.ID,
				status:           "expired",
				resultPct:        movePct,
				resultGridSteps:  moveGridSteps,
				maxFavPct:        favPct,
				maxAdvPct:        advPct,
				maxFavGrid:       favGrid,
				maxAdvGrid:       0,
				note:             "validation window expired",
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
			// adverse in grid steps = (adverse pct / 100) * signalPrice / gridStep
			advGrid := advPct / 100 * signalPrice / gridStep
			if advGrid >= sig.ValidationInvalidValue {
				invalidHit = true
			}
		}

		if targetHit {
			// Use favorablePct so confirmed always shows positive (up for buy, down for sell)
			resultPct := favPct
			if sig.SignalType == "sell" {
				resultPct = math.Abs(movePct) // sell confirmed = price went down = show as positive
			}
			results = append(results, validationResult{
				signalID:        sig.ID,
				status:          "confirmed",
				resultPct:       resultPct,
				resultGridSteps: moveGridSteps,
				maxFavPct:       favPct,
				maxAdvPct:       advPct,
				maxFavGrid:      favGrid,
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