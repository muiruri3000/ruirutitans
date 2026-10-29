# Ruiru Titans REST API Reference

The Ruiru Titans platform provides a REST API for reading tournament standings, fixtures, player statistics, casting votes, submitting community reactions, and performing administrative tasks.

---

## 1. Authentication Headers

Requests requiring authentication should include one of the following headers:

### CMS / Admin Endpoints
```http
X-Titans-CMS-Token: <signed_cms_token>
```
*Alternatively:* `Authorization: Bearer <signed_cms_token>` or active Django staff session cookies.

### Player Endpoints
```http
X-Titans-Player-Token: <signed_player_token>
```
*Alternatively:* `Authorization: Bearer <signed_player_token>`.

---

## 2. Authentication Endpoints

### `POST /api/auth/login/`
Authenticates a CMS Administrator.
- **Request Body**:
  ```json
  {
    "username": "manager",
    "password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "token": "signed.cms.token.here",
    "cms_user": {
      "username": "manager",
      "email": "manager@ruirutitans.com",
      "is_superuser": false,
      "is_staff": true
    }
  }
  ```

### `POST /api/auth/player-login/`
Authenticates a squad player using password or 4-digit activation code.
- **Request Body**:
  ```json
  {
    "username": "kelvin_k",
    "password": "PlayerPasswordOr4DigitCode",
    "category_key": "ruiru-titans-league-oct-nov-2026"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "token": "signed.player.token.here",
    "player": {
      "player_id": "T1-P1",
      "name": "Kelvin Kimani",
      "username": "kelvin_k",
      "team_id": "T1",
      "team_name": "Ruiru Titans FC",
      "must_change_password": false
    }
  }
  ```

### `GET /api/auth/status/`
Checks current authentication state for both CMS admin and Player sessions.
- **Response `200 OK`**:
  ```json
  {
    "cms_authenticated": true,
    "cms_user": { "username": "manager" },
    "player_authenticated": false,
    "player_user": null
  }
  ```

---

## 3. Tournament & Category Endpoints

### `GET /api/state/`
Returns the full active tournament state across all categories, teams, fixtures, and settings.

### `GET /api/categories/<str:key>/`
Fetches state and configuration for a single competition category.

### `POST /api/categories/create/`
*(Admin only)* Creates a new competition category.
- **Request Body**:
  ```json
  {
    "key": "under-20-cup",
    "label": "Under-20 Championship Cup",
    "mode": "cup",
    "format": "single",
    "group_letters": ["A", "B"],
    "teams": [...]
  }
  ```

### `POST /api/categories/<str:key>/archive/`
*(Admin only)* Archives or reopens an ended tournament.
- **Request Body**:
  ```json
  {
    "ended": true,
    "champion": "Mancheli FC",
    "runnerUp": "Oxford FC"
  }
  ```

---

## 4. Fixtures & Match Events

### `GET /api/categories/<str:key>/fixtures/`
Returns all league or cup fixtures for the specified competition.

### `POST /api/fixtures/<str:fixture_id>/events/`
*(Admin only)* Records match events for a fixture.
- **Request Body**:
  ```json
  {
    "events": [
      {
        "type": "goal",
        "teamId": "T1",
        "playerId": "T1-P1",
        "assistPlayerId": "T1-P2",
        "penalty": false
      },
      {
        "type": "yellow",
        "teamId": "T2",
        "playerId": "T2-P4"
      }
    ],
    "walkover": null,
    "referee": "Ref Joseph",
    "report": {
      "summary": "High intensity first half."
    }
  }
  ```

---

## 5. Duty Roster Endpoints

### `GET /api/categories/<str:key>/duty-roster/`
Retrieves the matchday duty roster, eligible teams, available players, exemptions, and completed duties.

### `POST /api/categories/<str:key>/duty-roster/exemptions/`
*(Admin only)* Adds or removes players from the duty exemption list.
- **Request Body (Add)**:
  ```json
  {
    "action": "add",
    "player_id": "T1-P1",
    "reason": "Official club match photographer"
  }
  ```
- **Request Body (Remove)**:
  ```json
  {
    "action": "remove",
    "player_id": "T1-P1"
  }
  ```

### `POST /api/categories/<str:key>/duty-roster/complete/`
*(Admin only)* Marks a specific player's duty (bib washing or goalpost storage) as completed or pending.
- **Request Body**:
  ```json
  {
    "date": "Wed, 28 Oct",
    "task_key": "bibs_wash_t1",
    "player_id": "T1-P1",
    "completed": true
  }
  ```

---

## 6. Community Comments & Reactions

### `GET /api/comments/`
Retrieves approved reactions for display in the public carousel.
- **Query Parameters**:
  - `status=all|pending|approved|rejected` *(Admin only: filters by status)*

### `POST /api/comments/`
Submits a new visitor reaction or executes an admin moderation action.
- **Public Submission**:
  ```json
  {
    "name": "Jane Supporter",
    "reaction": "🔥 Match On Fire",
    "comment": "Incredible match today! Titans fought hard!"
  }
  ```
- **Admin Moderation Action** *(Admin only)*:
  ```json
  {
    "action": "approve",
    "comment_id": 42
  }
  ```
  *(Supported actions: `approve`, `reject`, `delete`)*

---

## 7. Player Management & Usernames

### `POST /api/admin/players/update-username/`
*(Admin only)* Manually modifies a player's `@username`.
- **Request Body**:
  ```json
  {
    "player_id": "T1-P1",
    "new_username": "kelvin_legend",
    "category_key": "ruiru-titans-league-oct-nov-2026"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "player_id": "T1-P1",
    "username": "kelvin_legend",
    "name": "Kelvin Kimani",
    "team_id": "T1",
    "message": "Username for Kelvin Kimani updated to '@kelvin_legend'."
  }
  ```

---

## 8. Export & Printable Document Endpoints

| Endpoint | Method | Format | Description |
| :--- | :---: | :---: | :--- |
| `/api/categories/<key>/export/players-csv/` | `GET` | CSV | Player statistics (Goals, Assists, Cards) |
| `/api/categories/<key>/export/standings-csv/` | `GET` | CSV | Category league standings table |
| `/api/categories/<key>/export/fixtures-csv/` | `GET` | CSV | Fixture schedule and results |
| `/fixtures/<id>/sheet/` | `GET` | HTML/PDF | Official printable matchday team sheet |
| `/categories/<key>/pdf/` | `GET` | PDF | Printable high-resolution competition brochure |
