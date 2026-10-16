SHELL := /bin/bash
PY := api/.venv/bin/python
SCHEMA := packages/schema/listing.schema.json

.PHONY: setup dev api web schema evals test

setup:
	python3 -m venv api/.venv
	api/.venv/bin/pip install -q --upgrade pip
	api/.venv/bin/pip install -q -r api/requirements-dev.txt
	cd web && pnpm install

dev:
	@trap 'kill 0' EXIT; \
	(cd api && .venv/bin/uvicorn app.main:app --reload --port 8000) & \
	(cd web && pnpm dev --port 3000) & \
	wait

schema:
	api/.venv/bin/datamodel-codegen --input $(SCHEMA) --input-file-type jsonschema \
		--output-model-type pydantic_v2.BaseModel --output api/app/schema_gen.py \
		--use-standard-collections --use-union-operator --target-python-version 3.11 \
		--field-constraints --enum-field-as-literal all --collapse-root-models --disable-timestamp \
		--custom-file-header "# GENERATED from $(SCHEMA) by \`make schema\`. Do not edit."
	cd web && node scripts/gen-schema.mjs && pnpm exec prettier --write src/lib/schema.ts --log-level warn

evals:
	cd api && .venv/bin/python ../evals/run_evals.py $(ARGS)

test:
	cd api && .venv/bin/ruff check . ../evals && .venv/bin/mypy --strict pipeline ../evals/metrics.py && .venv/bin/pytest -q
	cd web && pnpm typecheck && pnpm lint && pnpm test
