# miniCRM

A collaborative CRM with real-time CRDT sync, WebSocket presence tracking, and an AI email assistant.

**Stack:** Spring Boot 3.4 · PostgreSQL · React 19 + Vite · Tailwind CSS v4 · STOMP/WebSocket

---

## Prerequisites

| Tool | Version |
|------|---------|
| Java | 21+ |
| Node.js | 18+ |
| Docker | any recent |

---

## Local Development

### 1. Start the database

```bash
docker compose up -d
```

Spins up PostgreSQL on `localhost:5432` (user/pass/db all `minicrm`).

---

### 2. Configure environment (optional)

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `SMB_USERNAME` | Samba username for the file browser (optional) |
| `SMB_PASSWORD` | Samba password for the file browser (optional) |
| `NTFY_TOPIC` | ntfy topic for appointment reminders (optional) |
| `REMINDER_DAYS_BEFORE` | Days before an appointment to remind, default `2,1` |
| `REMINDER_HOUR` | Hour of day reminders go out, default `9` |

The app runs fine without these — the file browser and push reminders will
simply be unavailable.

---

## Anmeldung

Alle Endpunkte unter `/api` und `/ws` sind geschützt. Angemeldet wird per
Benutzername und Passwort; der Zustand liegt in einer Server-Session
(`HttpOnly`, `SameSite=Strict`), nicht im Browser-Speicher. Dadurch übersteht
die Anmeldung ein Neuladen, und CSRF-Token sind nicht nötig — das Cookie geht
bei Anfragen von fremden Seiten gar nicht erst raus.

### Erstes Passwort

Benutzer aus der Zeit vor der Anmeldung haben noch keines. Beim Aufrufen steht
neben dem Namen **„Passwort fehlt"** — einmal anklicken, Passwort festlegen
(mindestens 8 Zeichen), fertig. Danach ist dieser Weg für den Benutzer zu.

Gibt es überhaupt keinen Benutzer, legt der Anmeldebildschirm den ersten an.
Auch dieser Weg schließt sich, sobald einer existiert.

### Passwort ändern

Angemeldet auf den eigenen Namen oben rechts klicken (mobil: Mehr → Passwort).
Das aktuelle Passwort wird mit abgefragt, die Sitzung bleibt bestehen.

### Passwort vergessen

Es gibt bewusst keinen Selbstbedienungs-Weg — bei zwei Leuten wäre eine
Zurücksetzen-Funktion mehr Angriffsfläche als Nutzen. Stattdessen auf dem Pi
den Hash leeren, danach greift wieder „Passwort festlegen":

```bash
docker exec -it minicrm-postgres \
  psql -U minicrm -d minicrm -c "UPDATE users SET password_hash = NULL WHERE username = 'simeon';"
```

> Weitere Benutzer lassen sich derzeit nur über die Datenbank anlegen — eine
> Benutzerverwaltung in der Oberfläche gibt es noch nicht.

---

## Termin-Erinnerungen (Push aufs Handy)

Der Server prüft alle 15 Minuten, ob eine Erinnerung fällig ist, und schickt sie
über [ntfy](https://ntfy.sh) aufs Handy — standardmäßig 2 Tage und 1 Tag vor dem
Termin um 9:00. Weil der Pi ohnehin durchläuft, braucht es dafür keinen
zusätzlichen Dienst.

### Einrichten

1. ntfy-App installieren (iOS oder Android, kostenlos)
2. Ein **langes, zufälliges** Thema abonnieren, z. B. `minicrm-f7k2p9x4qz`
3. Dasselbe Thema als `NTFY_TOPIC` hinterlegen:
   - lokal in `backend/src/main/resources/application-local.yml` (gitignored)
   - auf dem Pi in `/home/pi/minicrm/.env`

> **Der Themenname ist das einzige Geheimnis.** Wer ihn kennt, kann mitlesen und
> selbst Nachrichten schicken. Deshalb lang und zufällig wählen und niemals
> committen. Wer beide Handys auf dasselbe Thema abonniert, bekommt die
> Erinnerungen auf beiden Geräten.

Ob es aktiv ist, steht beim Start im Log:

```
Push-Erinnerungen aktiv (ntfy-Thema minicrm-***)
Push-Erinnerungen inaktiv — ntfy.topic ist nicht gesetzt
```

### Wann genau erinnert wird

Jede Vorlaufzeit hat ein 24-Stunden-Fenster statt eines exakten Zeitpunkts:

```
Termin: Do 14.08. um 14:00

  "in 2 Tagen"   Fenster  Di 12.08. 09:00 → Mi 13.08. 09:00
  "morgen"       Fenster  Mi 13.08. 09:00 → Do 14.08. 09:00
```

Das hat zwei Gründe: der Pi darf zwischendurch aus sein und holt die Erinnerung
beim nächsten Lauf nach — und ein Termin, der erst einen Tag vorher eingetragen
wird, bekommt keine unsinnige "in 2 Tagen"-Meldung mehr, weil dieses Fenster
bereits geschlossen ist. Wird ein Termin verschoben, gelten die Erinnerungen
wieder als offen.

---

### 3. Start the backend

```bash
cd backend
./mvnw spring-boot:run
```

Backend starts on **http://localhost:8080**.  
Spring Boot auto-creates all database tables on first run via JPA/Hibernate DDL.

---

### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend starts on **http://localhost:5173**.  
Vite proxies `/api` and `/ws` to the backend automatically — no CORS issues.

---

### 5. Create the first user

```bash
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","role":"ADMIN"}'
```

Then open http://localhost:5173 and log in with that username.

---

## Running Tests

```bash
# Frontend unit tests
cd frontend && npm test

# Backend tests (uses H2 in-memory DB)
cd backend && ./mvnw test
```

---

## Production Build (Raspberry Pi / self-hosted)

The `deploy-pi.sh` script builds everything locally and deploys to a remote host via SSH + systemd.

### One-time Pi setup

1. Install Docker and Java 21 on the Pi.
2. Create the app directory and `.env` file:
   ```bash
   mkdir -p /home/pi/minicrm
   cp .env.example /home/pi/minicrm/.env
   # edit .env and set SPRING_PROFILES_ACTIVE=prod plus your API keys
   ```
3. Start PostgreSQL on the Pi:
   ```bash
   cd /home/pi/minicrm && docker compose up -d
   ```

### Deploy

```bash
# Default target: dietpi@100.120.87.43
./deploy-pi.sh

# Custom target
./deploy-pi.sh user@192.168.1.100
```

The script:
1. Builds the React frontend (`npm run build`)
2. Copies the built assets into the Spring Boot static folder
3. Packages the backend as a fat JAR (`./mvnw clean package -DskipTests`)
4. Copies the JAR + docker-compose + systemd service to the Pi via `scp`
5. Installs and restarts the `minicrm` systemd service

App will be available at **http://\<pi-ip\>:8080** after deploy.

### Useful commands on the Pi

```bash
# Live logs
journalctl -u minicrm -f

# Restart
sudo systemctl restart minicrm

# Status
sudo systemctl status minicrm
```

---

## Project Structure

```
miniCRM/
├── backend/                  # Spring Boot application
│   └── src/main/java/com/collabcrm/
│       ├── config/           # WebSocket, CORS, SPA fallback
│       ├── controller/       # REST + WebSocket controllers
│       ├── crdt/             # CRDT implementations (LWW, OR-Set, PN-Counter)
│       ├── model/            # JPA entities
│       ├── repository/       # Spring Data repositories
│       └── service/          # Business logic (incl. PresenceService)
├── frontend/                 # React + Vite application
│   └── src/
│       ├── components/       # Reusable UI components
│       ├── crdt/             # Client-side CRDT mirror
│       ├── pages/            # Route-level page components
│       ├── services/         # API client + WebSocket service
│       └── types/            # Shared TypeScript types
├── archive/                  # Stillgelegte Features — nicht im Build (siehe archive/README.md)
├── docker-compose.yml        # PostgreSQL for local dev + Pi
├── deploy-pi.sh              # One-command build & deploy script
└── minicrm.service           # systemd unit file
```

---

## Features

- **Real-time collaboration** via STOMP/WebSocket — edits sync across all open tabs instantly
- **CRDT conflict resolution** — Last-Write-Wins registers, OR-Sets, and PN-Counters for offline-safe merges
- **Mitglieder panel** — Shows all team members with live online status (pulsing green dot) and "last seen" timestamp for offline members
- **Todos** — Quick capture with `@customer` linking and a comment thread per todo
- **Termine** — Appointments with push reminders 2 days and 1 day ahead via ntfy
- **Time tracking** — Per-user timer with customer/todo linking
- **File browser** — Samba (SMB) network share integration
- **Finance tracker** — VAT-aware income/expense entries, deposits, 50/50 profit
  splitting between two sole proprietors, and per-person progress against the
  SVS and small-business thresholds
