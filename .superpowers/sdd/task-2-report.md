# Task 2 Report — GetMovers (gainers/hot from WS cache)

## Status
DONE

## Commit
c05acf1

## Test Summary
Both new tests pass (`TestGetMovers_FiltersAndRanks`, `TestGetMovers_EmptyCache`): 2/2 PASS. TDD: tests failed first (undefined symbols), then passed after implementation.

## Concerns
- None. `strings` import was added to client_test.go (was missing). Ranking uses SliceStable; ties keep insertion order.
