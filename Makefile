# Convenience targets for local development. See README.md for details.
.PHONY: install dev-backend dev-frontend test test-backend test-frontend lint build

install:
	cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
	cd frontend && npm install

dev-backend:
	cd backend && . .venv/bin/activate && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd backend && . .venv/bin/activate && pytest

test-frontend:
	cd frontend && npm test

lint:
	cd frontend && npm run lint && npm run typecheck

build:
	cd frontend && npm run build
