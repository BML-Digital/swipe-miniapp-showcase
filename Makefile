.PHONY: setup run test bundle verify clean

setup:
	npm ci
	npm run db:init

run:
	npm run dev

test:
	npm test
	npm run check

bundle:
	npm run bundle

verify:
	npm test
	npm run verify

clean:
	rm -rf dist
