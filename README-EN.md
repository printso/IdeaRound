# IdeaRound - Cognitive Enhancement & Multi-Agent Decision Support System

## Project Overview
IdeaRound is a "Cognitive Enhancement & Multi-Agent Decision Support System" designed to break individual cognitive silos through multi-perspective AI agent collaboration.

## Structure
- `backend/`: FastAPI backend (Python)
- `frontend/`: React + TypeScript + Ant Design frontend
- `configs/`: Configuration files (excluding sensitive keys)

## Prerequisites
- Python 3.10+
- Node.js 18+
- MySQL 8.0+

## Setup & Run

### Backend
1. Navigate to `backend/`
2. Create virtual environment: `python -m venv venv`
3. Activate venv: `source venv/bin/activate` (or `venv\Scripts\activate` on Windows)
4. Install dependencies: `pip install -r requirements.txt`
5. Configure database in `.env` or `configs/config.yaml`
6. Run server: `uvicorn app.main:app --reload`

### Frontend
1. Navigate to `frontend/`
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev`

## Configuration
- LLM models are managed via the Admin Console (`/admin/models`).
- System prompts are stored in the database or as markdown files in `configs/prompts/`.
