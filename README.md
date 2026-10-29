# Ruiru Titans — Leagues, Cups & Tournament Platform

[![Python](https://img.shields.io/badge/Python-3.13-blue.svg)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-6.0-green.svg)](https://www.djangoproject.com/)
[![React](https://img.shields.io/badge/React-18.3-cyan.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple.svg)](https://vitejs.dev/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-k3s-blue.svg)](https://k3s.io/)

A full-stack sports championship management platform for **Ruiru Titans Football Club**, powered by **Django 6**, **Django REST Framework (DRF)**, and a **React 18 Single-Page Application (SPA)** interface crafted with Apple Human Interface Guidelines (HIG).

---

## 🏆 Key Features

- **Championship Competition Formats**:
  - **League Format**: Single or double round-robin with real-time league table calculations (P, W, D, L, GF, GA, GD, Pts) and 5-match form indicators.
  - **Cup Format**: Multi-group stages (Group A, B, etc.) and automated power-of-2 Knockout bracket progression (Final, Semi-Finals, Quarter-Finals).
- **Matchday Operations & Live Events**:
  - Granular recording of Goals, Own Goals, Assists, Yellow Cards, Red Cards, and Penalty Shootouts.
  - Automatic Walkover handler (3–0 default award).
  - Official printable team sheets (`/fixtures/<id>/sheet/`) and competition PDFs (`/categories/<key>/pdf/`).
  - Automated weekly AI narrative match reports.
- **Matchday Duty Roster**:
  - Automated logistics rotation:
    - **First Fixture**: Match bibs washing assigned to 2 opposing players.
    - **Second Fixture**: Transporting goalposts to/from storage assigned to 2 opposing players.
  - Exemption management for photographers, officials, and injured players.
  - Interactive admin completion tracking and public badge indicators.
  - 100% full-width responsive layout for smart devices.
- **Community Reactions & Moderation**:
  - Home page community section with reaction chips (🔥, ❤️, ⚽, 👏, ⚡, 🏆, 💪) and comment submissions.
  - Auto-rotating carousel with long comment reader modals.
  - Administrative moderation workflow (Approve, Reject, Delete) directly in the CMS.
- **Player & Club Leaderboards**:
  - Top Scorers (Golden Boot), Top Assists (Playmakers), Yellow Cards, and Red Cards.
  - Smart name formatting: displays **First Name** when available; falls back to **Username** with hover tooltips for full details.
  - One-click CSV export of player stats.
- **Squad & Tactical Tools**:
  - Squad manager with inline `@username` editing, player transfers, and position tagging.
  - Interactive pitch tactics board with customizable formations (4-3-3, 4-4-2, 3-5-2, etc.).
  - Squad balancer algorithm with Google Sheets CSV synchronization.
- **Dual Security & Authentication Architecture**:
  - **CMS Admin**: Role-based access with staff/superuser privileges, signed tokens, CSRF protection, and credential fingerprinting.
  - **Player Portal**: 4-digit code login, password reset, personal season dashboards, brute-force lockout, and weekly player award ballots.
- **Automated Backup & Disaster Recovery**:
  - Automated zero-downtime database snapshots and gzipped state exports with daily pruning.

---

## 📚 Documentation Index

Comprehensive technical documentation is organized in the [`docs/`](file:///home/marie/Desktop/ruirutitans/docs/) directory:

- [**System Architecture (`docs/ARCHITECTURE.md`)**](file:///home/marie/Desktop/ruirutitans/docs/ARCHITECTURE.md): Component diagrams, Django ORM entity relationships, dual-auth security model, and backup engine.
- [**REST API Specification (`docs/API.md`)**](file:///home/marie/Desktop/ruirutitans/docs/API.md): Endpoints for authentication, tournament state, match events, duty roster, visitor reactions, player usernames, and CSV/PDF exports.
- [**Frontend Design System (`docs/FRONTEND.md`)**](file:///home/marie/Desktop/ruirutitans/docs/FRONTEND.md): React 18 SPA architecture, Apple HIG color palette, view modules, light/dark mode switch, and Vite build pipeline.
- [**Deployment & Operations (`docs/DEPLOYMENT.md`)**](file:///home/marie/Desktop/ruirutitans/docs/DEPLOYMENT.md): Docker configurations, Kubernetes (K3s) manifests, persistent storage, Traefik ingress, and backup restoration procedures.
- [**Kubernetes Guide (`k8s/README.md`)**](file:///home/marie/Desktop/ruirutitans/k8s/README.md): Step-by-step setup for cluster provisioning and secret management.

---

## 🚀 Quickstart & Setup

### 1. Prerequisites
- Python 3.10+ (Python 3.13 tested)
- Node.js 18+ & npm
- Virtual environment (`venv`)

### 2. Backend Setup
```bash
# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start backend server
python manage.py runserver 0.0.0.0:8000
```

### 3. Frontend Development
```bash
cd frontend
npm install
npm run dev
```
The Vite development server runs at `http://localhost:5173`, proxying `/api` requests to Django at `http://127.0.0.1:8000`.

### 4. Production Frontend Build
```bash
# Build React assets with Vite
npm run build --prefix frontend

# Copy compiled bundles to Django static folder
cp frontend/dist/js/titans.js static/js/titans.js
cp frontend/dist/css/titans.css static/css/titans.css

# Collect static files
python manage.py collectstatic --noinput
```

---

## 🧪 Testing

Run all 125 backend unit tests:
```bash
python manage.py test
```

Run specific test modules:
```bash
# Visitor comments and username editing tests
python manage.py test tournaments.tests.VisitorCommentAndUsernameEditingTests

# Duty roster and logistics tests
python manage.py test tournaments.tests.DutyRosterTests

# Security, CSRF, and authentication audit tests
python manage.py test tournaments.test_security_audit
```

---

## 📂 Project Structure

```text
ruirutitans/
├── config/                     # Django project configuration & settings
│   ├── settings.py             # Settings, static files, middleware, DRF config
│   ├── urls.py                 # Root URL router
│   └── wsgi.py
├── tournaments/                # Core tournament application
│   ├── models.py               # Database models (Category, Team, Player, Fixture, etc.)
│   ├── views.py                # DRF API views, HTML/PDF views, export endpoints
│   ├── urls.py                 # API URL routing
│   ├── authentication.py       # Dual authentication handlers (CMS & Player)
│   ├── permissions.py          # DRF permission classes
│   ├── services.py             # Business logic, duty rosters, backups, standings
│   ├── tests.py                # Comprehensive test suite (125 tests)
│   └── management/commands/    # CLI tools (backup_database, audit_player_passwords, etc.)
├── frontend/                   # React 18 Single-Page Application
│   ├── src/
│   │   ├── components/         # Modular views (ClubHome, Fixtures, Stats, Standings, etc.)
│   │   ├── api/client.js       # Client API abstraction with offline fallback
│   │   ├── data/defaultState.js# Baseline tournament state and team profiles
│   │   ├── App.jsx             # Main application container and routing
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js          # Vite configuration
├── docs/                       # Technical documentation
│   ├── ARCHITECTURE.md         # System design, data models, and security
│   ├── API.md                  # Complete REST API reference
│   ├── FRONTEND.md             # UI design system, views guide, and theming
│   └── DEPLOYMENT.md           # Docker, Kubernetes, and operations guide
├── k8s/                        # Kubernetes orchestration manifests
├── static/                     # Production static assets (CSS, JS, images)
├── templates/                  # Django HTML templates (Match Sheets, PDF reports)
└── manage.py
```

---

## 🚢 Production Deployment

For deploying to production Kubernetes clusters (k3s / vanilla k8s) with Let's Encrypt SSL certificates, Persistent Volume Claims, and automated backup CronJobs, refer to [`docs/DEPLOYMENT.md`](file:///home/marie/Desktop/ruirutitans/docs/DEPLOYMENT.md) and [`k8s/README.md`](file:///home/marie/Desktop/ruirutitans/k8s/README.md).
