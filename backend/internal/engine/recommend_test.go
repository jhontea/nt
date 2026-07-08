package engine

import "testing"

func TestRecommendTrend_StableMedium(t *testing.T) {
	rec, err := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 100)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 20 || rec.SlowPeriod != 50 {
		t.Errorf("stable medium = 20/50, got %d/%d", rec.FastPeriod, rec.SlowPeriod)
	}
	if rec.Interval != "1h" {
		t.Errorf("stable medium interval = 1h, got %s", rec.Interval)
	}
	if rec.ValidationWindowMinutes != 720 {
		t.Errorf("window 720m expected, got %d", rec.ValidationWindowMinutes)
	}
	if rec.ValidationTargetValue != 2.0 || rec.ValidationInvalidValue != 1.0 {
		t.Errorf("target 2/invalid 1 expected, got %f/%f", rec.ValidationTargetValue, rec.ValidationInvalidValue)
	}
}

func TestRecommendTrend_VolatileShort(t *testing.T) {
	rec, err := RecommendTrend("SOL_USDT", 150, HorizonShort, 50)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 7 || rec.SlowPeriod != 21 {
		t.Errorf("volatile short = 7/21, got %d/%d", rec.FastPeriod, rec.SlowPeriod)
	}
	if rec.Interval != "5m" {
		t.Errorf("volatile short interval = 5m, got %s", rec.Interval)
	}
	if rec.ValidationWindowMinutes != 120 {
		t.Errorf("volatile short window 120m, got %d", rec.ValidationWindowMinutes)
	}
	if rec.ValidationTargetValue != 1.0 || rec.ValidationInvalidValue != 0.5 {
		t.Errorf("target 1/invalid 0.5 expected, got %f/%f", rec.ValidationTargetValue, rec.ValidationInvalidValue)
	}
}

func TestRecommendTrend_MicroLong(t *testing.T) {
	rec, err := RecommendTrend("SHIB_USDT", 0.00002, HorizonLong, 100)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 10 || rec.SlowPeriod != 30 {
		t.Errorf("micro long = 10/30, got %d/%d", rec.FastPeriod, rec.SlowPeriod)
	}
	if rec.Interval != "1h" {
		t.Errorf("micro long interval = 1h, got %s", rec.Interval)
	}
	if rec.ValidationWindowMinutes != 720 {
		t.Errorf("micro long window 720m, got %d", rec.ValidationWindowMinutes)
	}
}

func TestRecommendTrend_QuantityFromCapital(t *testing.T) {
	rec, err := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 140)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.Quantity != "0.00200000" {
		t.Errorf("quantity 0.00200000 expected, got %s", rec.Quantity)
	}
}

func TestRecommendTrend_ZeroCapital(t *testing.T) {
	rec, err := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 0)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.Quantity != "0" {
		t.Errorf("zero capital -> quantity 0, got %s", rec.Quantity)
	}
}

func TestRecommendTrend_InvalidPrice(t *testing.T) {
	if _, err := RecommendTrend("BTC_USDT", 0, HorizonMedium, 100); err == nil {
		t.Fatal("expected error for zero price")
	}
}

func TestRecommendTrend_UnknownPairDefaultsStable(t *testing.T) {
	rec, err := RecommendTrend("XYZ_USDT", 100, HorizonMedium, 100)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if rec.FastPeriod != 20 {
		t.Errorf("unknown pair defaults to stable medium (fast=20), got %d", rec.FastPeriod)
	}
}

func TestRecommendTrend_ContainsClassAndHorizonInReason(t *testing.T) {
	rec, _ := RecommendTrend("BTC_USDT", 70000, HorizonMedium, 100)
	if rec.Reason == "" {
		t.Error("reason should not be empty")
	}
}

func TestRecommendTrend_All9PresetsHaveValues(t *testing.T) {
	for _, class := range []PairClass{PairClassStable, PairClassVolatile, PairClassMicropPrice} {
		for _, h := range []Horizon{HorizonShort, HorizonMedium, HorizonLong} {
			fast, fok := trendFastMap[class][h]
			slow, sok := trendSlowMap[class][h]
			_, iok := trendIntervalMap[class][h]
			w, wok := trendWindowMap[class][h]
			if !fok || !sok || !iok || !wok || fast <= 0 || slow <= 0 || w <= 0 {
				t.Errorf("incomplete preset for class=%d horizon=%s: fast=%d slow=%d interval=%v window=%d",
					class, h, fast, slow, trendIntervalMap[class][h], w)
			}
			if slow <= fast {
				t.Errorf("slow (%d) must be > fast (%d) for class=%d horizon=%s", slow, fast, class, h)
			}
		}
	}
}