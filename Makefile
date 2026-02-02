export PATH := $(PWD)/bin:$(PATH)

all: lint build test

lint:
	pnpm prettier -c .
	pnpm eslint --cache .

build:

test:

format:
	pnpm prettier -w .

clean:
	rm -f .eslintcache
	find . -type d -name "dist" -a ! -path '*/node_modules/*' | xargs rm -rf

.PHONY: all lint build test format clean
