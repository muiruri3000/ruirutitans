# Ruiru Titans FC — Platform Architecture & System Design

This document details the architectural blueprints of the Ruiru Titans FC platform. It illustrates the interactions between the React single-page frontend, the Django REST Framework API layer, modular domain services, and database persistence models.

---

## 1. High-Level System Architecture

```mermaid
flowchart TD
    subgraph ClientLayer["🖥️ Presentation Layer (Client Browser)"]
        UI_Public["Public Users & Fans<br/>• Standings & Fixtures<br/>• Stats Leaderboards<br/>• Transfers Ledger<br/>• Suspensions Board<br/>• Matchweek MVP & Highlights"]
        UI_Player["Registered Players<br/>• Player Dashboard<br/>• TOTW / TOTT Ballot<br/>• Squad Transfer Request<br/>• Personal Profile & Password"]
        UI_Admin["CMS Managers & Staff<br/>• Match Sheet Logging<br/>• Transfer Review & Direct Moves<br/>• Disciplinary Ban Controls<br/>• Duty Roster & Balancer<br/>• Formation & Pitch Editor"]
    end

    subgraph APILayer["🛡️ API & Security Gateway (Django REST Framework)"]
        AUTH_CMS["TitansCMSAuthentication<br/>(Bearer Token / Staff Session / _cv)"]
        AUTH_PLAYER["TitansPlayerAuthentication<br/>(Bearer Token / Signed Token / _cv)"]
        PERM_GUARD{"Permission Guard<br/>• IsCMSAdmin<br/>• IsPlayerUser<br/>• ReadOnlyOrCMSAdmin"}
        ENDPOINTS["REST API Endpoints<br/>• /api/categories/<key>/transfers/<br/>• /api/categories/<key>/bans/<br/>• /api/categories/<key>/voting/<br/>• /api/categories/<key>/weekly-mvp/<br/>• /api/duty-roster/<br/>• /api/state/ & /api/comments/"]
    end

    subgraph ServiceLayer["⚙️ Domain Services (tournaments/services.py)"]
        SRV_TRANSFERS["Transfer Engine<br/>• Window toggle<br/>• Request submission<br/>• Squad migration & eligibility"]
        SRV_DISCIPLINE["Discipline & Bans<br/>• Game/Period sanctions<br/>• Return fixture calculation<br/>• Suspension lift"]
        SRV_VOTING["Voting & Formation<br/>• Ballot aggregation<br/>• TOTW / TOTT generation<br/>• Pitch coordinates"]
        SRV_MVP["MVP Spotlight<br/>• Saturday 8:00 PM cutoff<br/>• Algorithmic point scoring"]
        SRV_ROSTER["Duty Roster Engine<br/>• Category match pairing<br/>• Exemption management"]
    end

    subgraph DataLayer["🗄️ Persistence & Storage (SQLite / PostgreSQL)"]
        DB_TOURNAMENT[("Tournament Core<br/>Category, Team, Player,<br/>Fixture, MatchEvent")]
        DB_TRANSFERS[("Transfers & Bans<br/>TransferRequest,<br/>PlayerBan")]
        DB_HONOURS[("Honours & Voting<br/>VotingRound, VoterBallot,<br/>TOTW, WeeklyMVP")]
        DB_OPERATIONS[("Operations<br/>DutyRosterWeek, Assignment,<br/>VisitorComment, Highlights")]
    end

    UI_Public -->|HTTP REST / JSON| ENDPOINTS
    UI_Player -->|X-Titans-Player-Token| AUTH_PLAYER
    UI_Admin -->|X-Titans-CMS-Token| AUTH_CMS
    AUTH_CMS --> PERM_GUARD
    AUTH_PLAYER --> PERM_GUARD
    PERM_GUARD --> ENDPOINTS

    ENDPOINTS --> SRV_TRANSFERS
    ENDPOINTS --> SRV_DISCIPLINE
    ENDPOINTS --> SRV_VOTING
    ENDPOINTS --> SRV_MVP
    ENDPOINTS --> SRV_ROSTER

    SRV_TRANSFERS --> DB_TRANSFERS
    SRV_TRANSFERS --> DB_TOURNAMENT
    SRV_DISCIPLINE --> DB_TRANSFERS
    SRV_DISCIPLINE --> DB_TOURNAMENT
    SRV_VOTING --> DB_HONOURS
    SRV_MVP --> DB_HONOURS
    SRV_MVP --> DB_TOURNAMENT
    SRV_ROSTER --> DB_OPERATIONS
```

---

## 2. Transfer Window & Approval Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Player as 👤 Registered Player
    actor Admin as 🛡️ CMS Administrator
    participant Front as 🖥️ React TransfersView
    participant API as 🛡️ Django API Gateway
    participant Srv as ⚙️ Transfer Service
    participant DB as 🗄️ Database

    Note over Admin, Front: Administration opens the transfer window
    Admin->>Front: Toggle Transfer Window (Open)
    Front->>API: POST /api/categories/<key>/transfers/toggle-window/
    API->>Srv: toggle_transfer_window(category, is_open=True)
    Srv->>DB: category.transfer_window_open = True
    DB-->>Front: { status: "success", transfer_window_open: true }

    Note over Player, DB: Player submits request to switch squads
    Player->>Front: Select destination squad + reason
    Front->>API: POST /api/categories/<key>/transfers/ (with Player Token)
    API->>Srv: submit_transfer_request(player, to_team, reason)
    Srv->>DB: Check window status & create TransferRequest(status="pending")
    Note over DB: Player remains on current team (ineligible for new team yet)
    DB-->>Front: { transfer: { id: 101, status: "pending" } }

    Note over Admin, DB: Admin reviews and acts on the request
    Admin->>Front: Review Pending Transfers tab
    Front->>API: GET /api/categories/<key>/transfers/ (CMS Token)
    API-->>Front: Return pending list + notes input
    Admin->>Front: Click "Approve" with effective notes
    Front->>API: POST /api/categories/<key>/transfers/101/action/ { action: "approve" }
    API->>Srv: action_transfer_request(101, "approve", notes)
    Srv->>DB: player.team = to_team (Atomically reassign player)
    Srv->>DB: transfer.status = "approved", approved_at = now()
    DB-->>Front: Transfer certified & player squad updated

    Note over Player, Front: Public Completed Transfers ledger updates
    Front->>API: Public GET /api/categories/<key>/transfers/
    API-->>Front: Returns updated completed ledger with certified badge
```

---

## 3. Player Disciplinary Ban & Eligibility State Machine

```mermaid
stateDiagram-v2
    [*] --> ActiveEligible: Player Registered

    state ActiveEligible {
        [*] --> InSquad: Assigned to Club Squad
        InSquad --> PlayingMatches: Included in Match Sheet
        PlayingMatches --> YellowCardLogged: 1st / 2nd Yellow Card
        YellowCardLogged --> InSquad: Normal play
    }

    ActiveEligible --> InfringementRecorded: Rule Infringement / Red Card / Conduct Breach

    state Suspended {
        [*] --> DisciplinaryBanIssued: Admin logs PlayerBan
        DisciplinaryBanIssued --> GamesSanction: Ban by Games (1-5 Matches)
        DisciplinaryBanIssued --> PeriodSanction: Ban by Period (Weeks / Months)

        state GamesSanction {
            [*] --> MatchweekDeduction
        }
        state PeriodSanction {
            [*] --> DateCountdown
        }
    }

    InfringementRecorded --> Suspended: PlayerBan.is_active = True
    note right of Suspended
        player.is_banned = True
        Appears on Stats Disciplinary Board
        Excluded from match selection rosters
    end note

    Suspended --> BanLifted: Admin lifts ban OR fixtures served
    BanLifted --> ActiveEligible: PlayerBan.is_active = False, player.is_banned = False
```

---

## 4. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    CATEGORY ||--o{ TEAM : contains
    CATEGORY ||--o{ FIXTURE : organizes
    CATEGORY ||--o{ TRANSFER_REQUEST : governs
    CATEGORY ||--o{ PLAYER_BAN : enforces
    CATEGORY ||--o{ WEEKLY_MVP : awards

    TEAM ||--o{ PLAYER : rosters
    TEAM ||--o{ FIXTURE : plays_home
    TEAM ||--o{ FIXTURE : plays_away
    TEAM ||--o{ TRANSFER_REQUEST : source_team
    TEAM ||--o{ TRANSFER_REQUEST : target_team

    PLAYER ||--o{ MATCH_EVENT : participates
    PLAYER ||--o{ TRANSFER_REQUEST : requests
    PLAYER ||--o{ PLAYER_BAN : receives
    PLAYER ||--o{ WEEKLY_MVP : crowned

    FIXTURE ||--o{ MATCH_EVENT : logs

    CATEGORY {
        string key PK
        string label
        string mode
        boolean transfer_window_open
        boolean is_archived
    }

    TEAM {
        string team_id PK
        string name
        string color
        int points
    }

    PLAYER {
        string player_id PK
        string name
        string username
        string position
        int jersey_number
        boolean is_active
        boolean must_change_password
    }

    TRANSFER_REQUEST {
        int id PK
        string status
        string transfer_type
        text request_reason
        text admin_notes
        datetime effective_date
        datetime approved_at
        string approved_by
    }

    PLAYER_BAN {
        int id PK
        string ban_type
        int games_banned
        string period_description
        text reason
        string expected_fixture_return
        date return_date
        boolean is_active
        string imposed_by
    }

    FIXTURE {
        string fixture_id PK
        date date
        string home_team_id
        string away_team_id
        string referee
        boolean is_played
    }

    MATCH_EVENT {
        int id PK
        string event_type
        int minute
        boolean is_penalty
        boolean is_interference
    }

    WEEKLY_MVP {
        int id PK
        int week_number
        int points
        text rationale
        boolean is_finalized
    }
```

---

## 5. Architectural Principles & Guarantees

1. **Separation of Privileges (Role Isolation)**:
   - Public visitors have read access to stats, transfers, and fixtures without credentials.
   - Player accounts are authenticated with signed HMAC tokens verifying credential fingerprints (`_cv`), scoped strictly to their own ballots, profile, and squad requests.
   - Manager credentials (`is_staff` / `is_superuser`) are required for state persistence, match sheets, ban modifications, and transfer approvals.
2. **Atomic Squad Transfers**:
   - Transfer requests remain `pending` until approved. Updating squad membership executes via `player.save(update_fields=["team"])`, preserving event history while transitioning the player across future match sheets.
3. **Automated Disciplinary Synchronization**:
   - `player.is_banned` and `active_ban` are calculated dynamically on the model layer, ensuring consistency across API responses, client leaderboards, and roster pickers.
