# ideaRound - Round Table Creativity · Multi-Agent Decision Support System

<div align="center">

![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-green.svg)
![Node.js](https://img.shields.io/badge/node-20+-green.svg)
![FastAPI](https://img.shields.io/badge/fastapi-0.100+-green.svg)
![React](https://img.shields.io/badge/react-18+-green.svg)

**Reject Monotony, Let Ideas Collide and Elevate**

<a href="https://ideaground.sokaai.cn" target="_blank" rel="noopener noreferrer">🌐 Live Demo</a> • <a href="#-quick-start">Quick Start</a> • <a href="#-core-capabilities">Features</a> • <a href="#-architecture">Architecture</a> • <a href="#-configuration">Configuration</a>

</div>

---

ideaRound is a boundary-breaking Multi-Agent collaboration system.  
It doesn't directly provide standard answers — instead, it brings you a real and sophisticated intellectual collision: gather AI partners with different personality cores, professional backgrounds, and thinking styles, letting every question be thoroughly refined through deep debate, emotional resonance, and creative reconstruction.

---

## 🛡️ Core Capabilities

| Capability | Description |
|:---|:---|
| **Multi-Perspective Deep Thinking** | Enable multiple AI roles simultaneously to analyze problems from technical, business, ethical, and emotional perspectives, uncovering valuable insights through idea collisions |
| **Flexible Scenario Adaptation** | No limits — can be a think tank for product design, emotional counseling when confused, a debate arena for testing solutions, or an immersive creative role-playing stage |
| **Customizable AI Characters** | AI can be a sharp technical expert or a gentle, patient healing mentor. Different character styles bring completely different thinking and emotional experiences |
| **Extract Conclusions from Chaotic Discussions** | After thorough discussion, automatically organize core consensus, actionable recommendations, and decision references, turning scattered ideas into actionable plans |
| **Full Process Traceability** | Completely record every step from understanding requirements to forming final conclusions, making it easy to review discussions, questions, and optimization processes of different viewpoints |

---

## 💡 Quick Experience

### Creative Enhancement
"XiaoMi" is a local-first open-source AI assistant that transforms fragmented information into actionable tasks and a personal second brain through 8 media types. Data is stored locally with encrypted sync, inbox buffering maintains schedule integrity, and context-aware non-disturbing notifications completely solve cross-platform information fragmentation anxiety.

### Product Feature Reduction Decision
"Our app is bloated now. I want to cut the 'Community Badge System' which has only 5% user activity but extremely high development costs. Please simulate the protest emotions of veteran users who have collected hundreds of badges, and explore how to smoothly phase out this feature without losing core users."

### Critical Career Choice
"I'm currently earning 500K annual salary at a big company, with extremely boring but stable work. Now a startup is inviting me to join as a co-founder, no base salary but generous stock options, in the AI robotics field I'm passionate about. Please conduct a debate on 'Mid-life Financial Security' vs. 'Self-actualization Value' for the second half of life."

---

## ✨ System Screenshots
<div align="center">
<table>
<tr>
<td><img src="./assets/images/角色矩阵.png" alt="Role Matrix" width="100%"/></td>
<td><img src="./assets/images/角色灵魂配置.png" alt="Role Configuration" width="100%"/></td>
</tr>
<tr>
<td><img src="./assets/images/圆桌讨论.png" alt="Round Table Discussion" width="100%"/></td>
<td><img src="./assets/images/方案生成.png" alt="Solution Generation" width="100%"/></td>
</tr>
<tr>
<td><img src="./assets/images/提示词后台.png" alt="Prompt Admin" width="100%"/></td>
<td><img src="./assets/images/系统预设角色管理.png" alt="System Preset Roles" width="100%"/></td>
</tr>
</table>
</div>

---

## 🚀 Quick Start

### Environment Requirements

- Python 3.9+, Node.js 20+, MySQL 5.7+

**Database Configuration:**

1. Default is SQLite. To use MySQL, modify the database configuration in `.env`
2. Before first startup:
   - If using SQLite, copy `idearound.db` from configs to the backend directory
   - If using MySQL, create the database first, modify the database configuration in `.env`, then import `configs/idearound.sql` to initialize the database

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 15001

# Frontend
cd frontend
npm install
npm run dev
```

After startup, visit: http://localhost:5173

**Default Admin Account:** `admin` / `admin123` (Please change the password after first login)

---

## 🏗️ Architecture

### Tech Stack

**Backend:** FastAPI + SQLAlchemy (Async) + MySQL/SQLite + JWT + bcrypt

**Frontend:** React 18 + Ant Design + Vite + React Router v6

### System Architecture

```
Client → Nginx → Frontend (React) → Backend (FastAPI) → MySQL/LLM APIs
```

### Project Structure

```
ideaRound/
├── backend/           # FastAPI Backend
│   ├── app/
│   │   ├── api/      # API Routes
│   │   ├── core/     # Core Configuration
│   │   ├── models/   # Data Models
│   │   └── schemas/  # Pydantic Schemas
│   ├── configs/      # Configuration files, including database initialization scripts
│   └── init_*.py     # Initialization scripts
├── frontend/         # React Frontend
│   └── src/
│       ├── components/  # Components
│       ├── contexts/    # Context
│       ├── pages/       # Pages
│       └── api/         # API Calls
```

---

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env`:

### Authentication

| Role | Permissions |
|------|------|
| admin | All permissions |
| user | Workspace, Chat, Model Management |
| guest | Workspace read-only |

## 📄 License

[AGPL-3.0](LICENSE) - Open source, but modified versions provided over a network must be open source

---

<div align="center">

**If this project helps you, please give a ⭐️ Star!**

Made with ❤️ by ideaRound Team

</div>
