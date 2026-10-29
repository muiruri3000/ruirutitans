# Ruiru Titans Frontend Guide & Design System

The Ruiru Titans frontend is a Single-Page Application (SPA) built with **React 18** and **Vite**, styled using an **Apple Human Interface Guidelines (HIG)** aesthetic combined with modern sports stadium branding.

---

## 1. Visual Design Language

### 1.1 Color Palette
The interface uses pitch-inspired deep emeralds and stadium golds:
- **Pitch Obsidian**: `#061610` (Dark canvas background)
- **Deep Emerald**: `#0F2E24` (Surface cards and container panels)
- **Border Emerald**: `#1E4636` / `#2B5746` (Subtle 1px card borders)
- **Titans Trophy Gold**: `#C9A227` (Primary accent, key buttons, headers)
- **Safety Amber**: `#FF9500` (Highlights, golden boot, active indicators)
- **Pitch Green**: `#30D158` / `#4ADE80` (Wins, completed statuses, success chips)
- **Card Crimson**: `#EF4444` / `#B23A2E` (Losses, expulsions, red cards)

### 1.2 Typography
- **Scores & Headers**: Clean display monospace / scoreboard styling with subtle letter-spacing (`letterSpacing: '0.04em'`).
- **Body & Labels**: System fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) with high-contrast text hierarchies (`#F4F2EA` primary, `#C2D6CB` secondary, `#8E8E93` muted).

### 1.3 Dark & Light Theming
A floating toggle switch anchored in the lower corner allows instant switching between:
- **Dark Mode (Default)**: Deep stadium night palette.
- **Light Mode**: High-contrast daylight theme utilizing cool neutral grays and crisp card elevations.

---

## 2. Views & Feature Modules

### 2.1 Club Home (`ClubHomeView.jsx`)
- **Hero Carousel**: Club gallery photos showcasing championship moments and match action. Admins can upload new images directly from the UI.
- **Jersey Collections**: Visual carousel displaying current season kits (Home, Away, Wazae legacy kits).
- **Visitor Reactions & Comments**:
  - Interactive reaction form for visitors (chips: 🔥, ❤️, ⚽, 👏, ⚡, 🏆, 💪).
  - Truncated comments with `"Read full comment →"` modal for long reactions.
  - Moderated auto-sliding carousel (4.5s per slide).
  - Inline CMS moderation bar with filter tabs (`Approved`, `Pending`, `Rejected`, `All`).

### 2.2 Fixtures & Match Days (`FixturesView.jsx`)
- Grouped by matchday week (e.g., Week 1, Week 2).
- Displays kickoff time, teams, colors, scoreboards, and venue (`Thoome Pri.`).
- Visual indicators for completed matches, walkovers (3–0), and penalty shootouts.
- Direct links to **Official Printable Match Sheets** (`/fixtures/<id>/sheet/`).
- Inline Match Event editor for CMS administrators with goalscorer and assist selection.
- **AI Weekly Matchweek Summaries**: Automatic narrative commentary generation.

### 2.3 Standings Table (`StandingsView.jsx`)
- Live calculated league table:
  - **P**: Matches Played
  - **W / D / L**: Wins, Draws, Losses
  - **GF / GA / GD**: Goals For, Goals Against, Goal Difference
  - **Pts**: Total Points
- **Form Guide**: Last 5 matches rendered as color-coded badges (`W`, `D`, `L`).
- Tiebreaker hierarchy: Points &rarr; Goal Difference &rarr; Goals For.

### 2.4 Official Player Statistics (`StatsView.jsx`)
- Filterable by active league or all historical categories.
- 4 dedicated leaderboard cards:
  - **Top Scorers (Golden Boot)**
  - **Top Assists (Playmakers)**
  - **Yellow Cards (Discipline)**
  - **Red Cards (Expulsions)**
- **Name Display Rule**:
  - Displays **First Name** when available (e.g. `Kelvin`, `Francis`).
  - Falls back to **Username** if First Name is not available (e.g. `kelvin_k`, `francis_m`).
  - Full name available on hover / tap tooltip.
- One-click CSV export button.

### 2.5 Matchday Duty Roster (`DutyRosterView.jsx`)
- **Duty 1 (First Fixture)**: Washing the teams' match bibs (assigned to 2 opposing players).
- **Duty 2 (Second Fixture)**: Transporting the side goalposts to and from the store (assigned to 2 opposing players).
- **Player Exemptions**: Admin-managed exemption registry to prevent selected players from being assigned logistics duties.
- **Completion Checkmarks**: Admins can tick duties as done; completed players appear with a green badge in the public view.
- **Mobile Responsive Design**: Containers stretch to 100% width on smart devices with Apple HIG spacing.

### 2.6 Player Honours & History (`ArchivesView.jsx`)
- Historical season registry for completed championships.
- Displays champions, runner-ups, total goals, and top scorer awards.
- Ability for CMS admins to archive or reopen tournaments.

### 2.7 Weekly Player Awards (`VotingView.jsx`)
- Weekly position-based ballot (GK, DEF, MID, FWD).
- Validates player votes and prevents multiple submissions per round.
- Real-time tally display.

### 2.8 Interactive Tactics Board (`TacticsView.jsx`)
- Interactive drag-and-drop pitch board for team coaches.
- Supports standard formations (4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2).
- Tactical player positioning and visual formation sharing.

### 2.9 Automated Team Balancer (`TeamBalancerView.jsx`)
- Squad balancing algorithm that equalizes player ratings and positions across teams.
- Supports importing player rosters from Google Sheets CSV links or raw pasted tables.

### 2.10 Squad Manager Dashboard (`ManageView.jsx`)
- CMS control panel for team management:
  - Add / edit teams and assign jersey colors.
  - Add / remove players and assign squad numbers.
  - **Inline Username Editing**: Click any player's `@username` to edit and save immediately.
  - Transfer players between teams while preserving player IDs and career stats.
  - Generate automated round-robin tournament fixture schedules.

---

## 3. Build & Development

### Local Development Server
```bash
cd frontend
npm install
npm run dev
```
Runs the Vite development server with hot-module reloading at `http://localhost:5173`. API calls are proxied to Django at `http://127.0.0.1:8000`.

### Production Build
```bash
npm run build --prefix frontend
```
Builds optimized production assets into `frontend/dist/`. Assets can then be synced to Django's static directory:
```bash
cp frontend/dist/js/titans.js static/js/titans.js
cp frontend/dist/css/titans.css static/css/titans.css
python manage.py collectstatic --noinput
```
