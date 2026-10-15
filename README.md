# Ruiru Titans — Leagues & Cups (Full-Stack Django Platform)

A full-stack football and sports tournament management platform for **Ruiru Titans**, built with **Python Django 6**, **Django REST Framework (DRF)**, **SQLite / PostgreSQL**, and a responsive frontend interface.

---

## 🏆 Key Features

- **Tournament Modes**:
  - **League Format**: Single or Double round-robin, automated league standings table (P, W, D, L, GF, GA, GD, Pts), and form guides.
  - **Cup Format**: Group stages with dynamic group counts (A, B, C...) + automated power-of-2 Knockout bracket progression (Final, Semi-Finals, Quarter-Finals, etc.).
- **Live Match & Event Management**:
  - Record Goals, Own Goals, Assists, Yellow Cards, Red Cards.
  - Walkover handler (default 3–0 award).
  - Penalty shootout tracking for knockout ties.
  - Referee assignment per fixture.
  - Cross-match disciplinary tracking (carding bystanders/substitutes from other squads).
- **Automated Disciplinary Engine**:
  - Automatic 1-match suspension tracking for Red Cards and yellow card accumulations (every 3rd yellow card).
  - Visual suspension warnings attached directly to fixture cards and squad rosters.
- **Player & Club Leaderboards**:
  - Golden Boot (Top Scorers).
  - Playmaker Award (Top Assists).
  - Disciplinary Table (Yellow cards, Red cards, Own goals).
- **Squad & Tournament Management**:
  - Add / edit teams with automatic color palette assignment.
  - Add / remove players, set positions (GK, DEF, MID, FWD), and track unknown scorers.
  - Add multiple categories/divisions (Open League, Under-20 Cup, Veterans Cup, etc.).
  - Automated round-robin fixture generator with scheduling preferences (kickoff times and days).
- **Backend Persistence & Admin**:
  - Django Admin dashboard (`/admin/`) with tabular inlines for quick management.
  - Full REST API (`/api/state/`, `/api/categories/`, `/api/standings/`, etc.).
  - Real-time client synchronization with Django backend and optimistic offline cache.

---

## 🚀 Quickstart & Setup

### 1. Prerequisites
- Python 3.10+ (Python 3.13 supported)
- Virtual environment (`venv`)

### 2. Installation
```bash
# Clone or navigate to the repository
cd ruirutitans

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Run Migrations & Seed Data
```bash
# Run database migrations
python manage.py migrate

# Load initial Ruiru Titans historical season data
python manage.py load_titans_data
```

### 4. Start Development Server
```bash
python manage.py runserver 0.0.0.0:8000
```
Open your browser and navigate to:
- **Main Tournament App**: [http://localhost:8000/](http://localhost:8000/)
- **Django Admin Panel**: [http://localhost:8000/admin/](http://localhost:8000/admin/)
  - **Username**: `admin`
  - **Password**: `admin123`
- **State API**: [http://localhost:8000/api/state/](http://localhost:8000/api/state/)

---

## 🧪 Testing

Run the test suite with:
```bash
python manage.py test
```

---

## 📂 Project Structure

```text
ruirutitans/
├── config/                  # Django project configuration
│   ├── settings.py          # App settings, static, CORS, templates
│   ├── urls.py              # Root URL routing
│   └── wsgi.py
├── tournaments/             # Main tournament application
│   ├── models.py            # Category, Team, Player, Referee, Fixture, MatchEvent
│   ├── serializers.py       # DRF serializers
│   ├── views.py             # API views & SPA entrypoint
│   ├── urls.py              # App URLs
│   ├── admin.py             # Django admin classes & inlines
│   ├── services.py          # State import/export & calculations
│   ├── tests.py             # Unit tests
│   └── management/
│       └── commands/
│           └── load_titans_data.py # Seed data loader
├── templates/
│   └── index.html           # Main SPA template with CSRF integration
├── static/
│   ├── css/
│   │   └── titans.css       # Pitch green & gold custom styling
│   ├── js/
│   │   └── titans.js        # Interactive tournament frontend logic
│   └── images/
│       └── club-logo.jpg    # Ruiru Titans crest
├── ruiru-titans-1.html      # Original standalone HTML file (preserved)
├── requirements.txt         # Pinned Python dependencies
├── .env.example             # Safe environment variable template
└── manage.py
```
