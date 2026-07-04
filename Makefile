.PHONY: all build vet test clean run dev

all: build vet test

build:
	cd backend && go build ./...

vet:
	cd backend && go vet ./...

test:
	cd backend && go test -count=1 ./...

test-cover:
	cd backend && go test -count=1 -cover ./...

run:
	cd backend && go run ./cmd/server/

dev:
	cd frontend && npm install && npm run dev

mocks:
	cd backend && go generate ./...

clean:
	cd backend && go clean -testcache
	rm -f backend/coverage.out backend/t backend/t.out backend/coverage

docker:
	docker-compose up --build

.PHONY: all build vet test test-cover run dev mocks clean docker
