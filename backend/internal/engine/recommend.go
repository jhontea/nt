package engine

import (
	"fmt"
	"math"
	"strconv"
)

type PairClass int

const (
	PairClassStable PairClass = iota
	PairClassVolatile
	PairClassMicropPrice
)

type Horizon string

const (
	HorizonShort  Horizon = "short"
	HorizonMedium Horizon = "medium"
	HorizonLong   Horizon = "long"
)

type ValidationMode string

const (
	ValidationPercent    ValidationMode = "percent"
	ValidationGridSteps  ValidationMode = "grid_steps"
)

type GridRecommendation struct {
	Symbol                   string
	CurrentPrice             float64
	UpperPrice               float64
	LowerPrice               float64
	GridCount                int
	StepSize                 float64
	Quantity                 string
	ValidationMode           ValidationMode
	ValidationTargetValue    float64
	ValidationInvalidValue   float64
	ValidationWindowMinutes  int
	Reason                   string
}

var pairClassMap = map[string]PairClass{
	"BTC_USDT":  PairClassStable,
	"ETH_USDT":  PairClassStable,
	"BNB_USDT":  PairClassStable,
	"SOL_USDT":  PairClassVolatile,
	"DOT_USDT":  PairClassVolatile,
	"DOGE_USDT": PairClassVolatile,
	"SHIB_USDT": PairClassMicropPrice,
}

func classForPair(symbol string) PairClass {
	if c, ok := pairClassMap[symbol]; ok {
		return c
	}
	return PairClassStable
}

var rangePctMap = map[PairClass]map[Horizon]float64{
	PairClassStable: {
		HorizonShort:  5,
		HorizonMedium: 10,
		HorizonLong:   15,
	},
	PairClassVolatile: {
		HorizonShort:  7,
		HorizonMedium: 12,
		HorizonLong:   18,
	},
	PairClassMicropPrice: {
		HorizonShort:  10,
		HorizonMedium: 18,
		HorizonLong:   25,
	},
}

var gridCountMap = map[PairClass]map[Horizon]int{
	PairClassStable: {
		HorizonShort:  7,
		HorizonMedium: 10,
		HorizonLong:   12,
	},
	PairClassVolatile: {
		HorizonShort:  6,
		HorizonMedium: 9,
		HorizonLong:   11,
	},
	PairClassMicropPrice: {
		HorizonShort:  5,
		HorizonMedium: 7,
		HorizonLong:   9,
	},
}

// windowMap is in minutes
var windowMap = map[PairClass]map[Horizon]int{
	PairClassStable: {
		HorizonShort:  120,  // 2h
		HorizonMedium: 240,  // 4h
		HorizonLong:   480,  // 8h
	},
	PairClassVolatile: {
		HorizonShort:  45,  // 30-60m
		HorizonMedium: 90,  // 1-2h
		HorizonLong:   240, // 4h
	},
	PairClassMicropPrice: {
		HorizonShort:  20,  // 15-30m
		HorizonMedium: 45,  // 30-60m
		HorizonLong:   120, // 2h
	},
}

func RecommendGrid(symbol string, currentPrice float64, horizon Horizon, capital float64, validationMode ValidationMode) (*GridRecommendation, error) {
	if currentPrice <= 0 {
		return nil, fmt.Errorf("invalid current price: %f", currentPrice)
	}
	if capital < 0 {
		return nil, fmt.Errorf("invalid capital: %f", capital)
	}

	class := classForPair(symbol)
	rangePct := rangePctMap[class][horizon]
	gridCount := gridCountMap[class][horizon]
	windowMin := windowMap[class][horizon]

	upper := round8(currentPrice * (1 + rangePct/100))
	lower := round8(currentPrice * (1 - rangePct/100))
	stepSize := (upper - lower) / float64(gridCount)

	quantity := "0"
	if capital > 0 {
		allocPerGrid := capital / float64(gridCount)
		q := allocPerGrid / currentPrice
		quantity = strconv.FormatFloat(math.Round(q*1e8)/1e8, 'f', 8, 64)
	}

	var targetVal, invalidVal float64
	if validationMode == ValidationPercent {
		targetVal = rangePct / 10 // e.g., 10% range => 1% target
		invalidVal = targetVal * 0.5
		if targetVal < 0.5 {
			targetVal = 1.0
			invalidVal = 0.5
		}
	} else {
		targetVal = 2 // 2 grid steps
		invalidVal = 1 // 1 grid step
	}

	reason := fmt.Sprintf("%s diklasifikasikan sebagai %s, horizon %s: range ±%.0f%%, grid %d, evaluasi %dm",
		symbol, pairClassName(class), horizon, rangePct, gridCount, windowMin)

	return &GridRecommendation{
		Symbol:                  symbol,
		CurrentPrice:            currentPrice,
		UpperPrice:              upper,
		LowerPrice:              lower,
		GridCount:               gridCount,
		StepSize:                stepSize,
		Quantity:                quantity,
		ValidationMode:          validationMode,
		ValidationTargetValue:   targetVal,
		ValidationInvalidValue:  invalidVal,
		ValidationWindowMinutes: windowMin,
		Reason:                  reason,
	}, nil
}

func pairClassName(c PairClass) string {
	switch c {
	case PairClassStable:
		return "stabil"
	case PairClassVolatile:
		return "volatil menengah"
	case PairClassMicropPrice:
		return "volatil sangat tinggi"
	default:
		return "stabil"
	}
}

func round8(f float64) float64 {
	return math.Round(f*1e8) / 1e8
}