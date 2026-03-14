# IdeaRound - Cognitive Enhancement & Multi-Agent Decision Support System

## Project Overview
IdeaRound is a "Cognitive Enhancement & Multi-Agent Decision Support System" designed to break individual cognitive silos through multi-perspective AI agent collaboration. The system supports multi-turn conversations, agent consensus building, and creative collaboration.

## Tech Stack
- **Backend**: FastAPI + SQLAlchemy (Async) + MySQL
- **Frontend**: React 19 + TypeScript + Vite + Ant Design 6
- **AI**: OpenAI-compatible LLM interfaces

## Project Structure
```
IdeaRound/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API routes
│   │   ├── core/        # Core configuration
│   │   ├── models/      # Database models
│   │   └── schemas/     # Pydantic schemas
│   └── requirements.txt
├── frontend/            # React frontend
│   ├── src/
│   │   ├── api/        # API client
│   │   ├── layouts/    # Layout components
│   │   └── pages/      # Page components
│   └── package.json
├── .env.example        # Environment variables template
└── README-EN.md
```

## Prerequisites
- Python 3.10+
- Node.js 18+
- MySQL 8.0+

## Setup & Run

### Environment Preparation

#### 1. Clone the Project
```bash
git clone https://github.com/printso/IdeaRound.git
cd IdeaRound
```

#### 2. Configure MySQL Database
Ensure MySQL service is running and create the database:
```sql
CREATE DATABASE IdeaRound CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 3. Configure Environment Variables

**Create .env file from template:**
```bash
# Copy the template
cp .env.example .env

# Edit .env and set your values
# DATABASE_URL=mysql+aiomysql://root:your_password@127.0.0.1/IdeaRound
# SERVER_HOST=0.0.0.0
# SERVER_PORT=8000
# PROMPTS_BASE_PATH=configs/prompts
```

### Backend Setup

#### 1. Navigate to Backend Directory
```bash
cd backend
```

#### 2. Create and Activate Virtual Environment
```bash
# Create virtual environment
python -m venv venv

# Activate on Windows
venv\Scripts\activate

# Activate on Linux/Mac
source venv/bin/activate
```

#### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

#### 4. Start Backend Server
```bash
# Development mode (with auto-reload)
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

The backend will run on `http://localhost:8000`, and API documentation is available at `http://localhost:8000/docs`.

### Frontend Setup

#### 1. Navigate to Frontend Directory
```bash
cd frontend
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Configure API Address
Ensure the proxy configuration in `frontend/vite.config.ts` is correct:
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true
    }
  }
}
```

#### 4. Start Development Server
```bash
# Development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The frontend will run on `http://localhost:5173` (default Vite port).

## Quick Start

1. Ensure both backend and frontend are running
2. Access the frontend URL in your browser (default `http://localhost:5173`)
3. Go to Admin Console `/admin/models` to configure LLM models
4. Start using the chat functionality

## Configuration

### LLM Model Configuration
The system supports multiple LLM providers, configurable via:
- **Web Interface**: Visit `/admin/models` for management
- **Database**: Configure directly in the `llm_configs` table

### System Prompts
System prompts support the following storage methods:
- **Database Storage**: Manage via admin interface
- **File Storage**: Markdown files in `configs/prompts/` directory

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | Database connection string | - |
| SERVER_HOST | Server listen address | 0.0.0.0 |
| SERVER_PORT | Server port | 8000 |
| PROMPTS_BASE_PATH | Prompts base path | configs/prompts |

## Project Maintenance

### Database Operations
```sql
-- List tables
SHOW TABLES;

-- Describe table structure
DESC chat_room;
DESC message;
DESC llm_config;
```

### Log Viewing
```bash
# Backend logs are output directly to terminal
# To persist logs, redirect output
uvicorn backend.app.main:app --reload > backend.log 2>&1
```

## Troubleshooting

**Q: Database connection failed?**
A: Check if DATABASE_URL format is correct, ensure MySQL service is running and user permissions are set correctly.

**Q: Frontend cannot connect to backend?**
A: Check CORS configuration. Development mode allows all origins by default.

**Q: Port already in use?**
A: Change the port in configuration files or use `--port` parameter to specify a different port.

## License
MIT License