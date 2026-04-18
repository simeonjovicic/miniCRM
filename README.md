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
| `GROQ_API_KEY` | Groq API key for the AI email assistant (optional) |
| `SMB_USERNAME` | Samba username for the file browser (optional) |
| `SMB_PASSWORD` | Samba password for the file browser (optional) |

The app runs fine without these — AI and file browser features will simply be unavailable.

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
├── docker-compose.yml        # PostgreSQL for local dev + Pi
├── deploy-pi.sh              # One-command build & deploy script
└── minicrm.service           # systemd unit file
```

---

## Features

- **Real-time collaboration** via STOMP/WebSocket — edits sync across all open tabs instantly
- **CRDT conflict resolution** — Last-Write-Wins registers, OR-Sets, and PN-Counters for offline-safe merges
- **Mitglieder panel** — Shows all team members with live online status (pulsing green dot) and "last seen" timestamp for offline members
- **AI email assistant** — Powered by Groq / Llama 3.3 70B, context-aware of your CRM data
- **Time tracking** — Per-user timer with customer/todo linking
- **File browser** — Samba (SMB) network share integration
- **Finance tracker** — Income/expense entries with per-user breakdown
