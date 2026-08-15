#!/bin/bash
set -euo pipefail

PI_HOST="${1:-simeon@100.120.87.43}"
# Muss zu WorkingDirectory in minicrm.service passen — wird unten geprueft.
PI_DIR="${PI_DIR:-/home/simeon/minicrm}"
# Tests laufen mit; zum Ueberspringen: SKIP_TESTS=1 ./deploy-pi.sh
SKIP_TESTS="${SKIP_TESTS:-0}"

JAR="backend/target/collab-crm-0.0.1-SNAPSHOT.jar"

echo "=== MiniCRM — Build & Deploy auf $PI_HOST ==="

# ── 0. Vorpruefungen ────────────────────────────────────────────────
# Lieber hier abbrechen als einen halben Deploy hinterlassen.

# Das Zielverzeichnis muss dem entsprechen, aus dem der Dienst startet.
# Das Script kopiert die Unit-Datei mit, ein Auseinanderlaufen faellt sonst
# erst auf, wenn der Dienst das JAR nicht findet.
SERVICE_DIR=$(grep -oP '(?<=^WorkingDirectory=).*' minicrm.service || true)
if [ -z "$SERVICE_DIR" ]; then
  # grep -P gibt es auf macOS nicht — Rueckfallweg
  SERVICE_DIR=$(sed -n 's/^WorkingDirectory=//p' minicrm.service)
fi
if [ "$SERVICE_DIR" != "$PI_DIR" ]; then
  echo "ABBRUCH: Zielverzeichnis und Dienst passen nicht zusammen."
  echo "  deploy-pi.sh liefert nach : $PI_DIR"
  echo "  minicrm.service startet in: $SERVICE_DIR"
  echo "  Eines von beiden angleichen, sonst findet der Dienst das JAR nicht."
  exit 1
fi

if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$PI_HOST" true 2>/dev/null; then
  echo "ABBRUCH: keine SSH-Verbindung zu $PI_HOST."
  echo "  Laeuft Tailscale? Ist der Schluessel geladen (ssh-add -l)?"
  exit 1
fi

# Ohne .env startet der Dienst ohne Datenbank-Passwort und ohne Push-Thema.
if ! ssh "$PI_HOST" "test -f $PI_DIR/.env"; then
  echo "ABBRUCH: $PI_DIR/.env fehlt auf dem Pi."
  echo "  Vorlage ist .env.example — mindestens SPRING_PROFILES_ACTIVE=prod setzen."
  exit 1
fi

if ! ssh "$PI_HOST" "grep -q '^NTFY_TOPIC=.\\+' $PI_DIR/.env"; then
  echo "Hinweis: NTFY_TOPIC ist in $PI_DIR/.env nicht gesetzt —"
  echo "         Termin-Erinnerungen bleiben still. Alles andere laeuft."
fi

# ── 1. Tests ────────────────────────────────────────────────────────
if [ "$SKIP_TESTS" != "1" ]; then
  echo "→ Tests..."
  (cd frontend && npm test --silent)
  (cd backend && ./mvnw -q test)
fi

# ── 2. Frontend bauen und ins Backend legen ─────────────────────────
echo "→ Frontend bauen..."
(cd frontend && npm run build)

echo "→ Frontend in Backend kopieren..."
rm -rf backend/src/main/resources/static
cp -r frontend/dist backend/src/main/resources/static

# ── 3. Backend als ausfuehrbares JAR ────────────────────────────────
echo "→ Backend JAR bauen..."
(cd backend && ./mvnw clean package -DskipTests -q)

echo "→ JAR gebaut: $JAR ($(du -h "$JAR" | cut -f1))"

# Der Pi laeuft auf Java 21 — hier wird mit einem neueren JDK gebaut.
# Class-File 65 entspricht Java 21; alles darueber startet dort nicht.
#
# NR==1 ist noetig: od haengt auf macOS eine Zeile mit dem Endversatz an, ohne
# das lieferte awk zwei Zahlen und der Vergleich unten scheiterte mit
# "integer expression expected" — und liess damit alles durch.
MAJOR=$(unzip -p "$JAR" BOOT-INF/classes/com/collabcrm/CollabCrmApplication.class \
        | od -An -tu1 -j6 -N2 | awk 'NR==1 {print $1*256+$2; exit}')
# Eine Pruefung, die sich selbst nicht lesen kann, muss abbrechen und nicht
# durchwinken — sonst faellt erst auf dem Pi auf, dass sie nichts geprueft hat.
if ! [[ "$MAJOR" =~ ^[0-9]+$ ]]; then
  echo "ABBRUCH: Class-File-Version im JAR nicht lesbar (gelesen: '$MAJOR')."
  echo "  Ohne diese Pruefung koennte ein zu neues JAR auf dem Pi landen."
  exit 1
fi
if [ "$MAJOR" -gt 65 ]; then
  echo "ABBRUCH: JAR enthaelt Class-File $MAJOR (Java $((MAJOR-44)))."
  echo "  Der Pi hat Java 21 und wuerde mit UnsupportedClassVersionError abbrechen."
  exit 1
fi
echo "→ Java-Prueflauf: Class-File $MAJOR (Java $((MAJOR-44))) — passt zum Pi"

# ── 4. Uebertragen ──────────────────────────────────────────────────
echo "→ Deploy nach $PI_DIR..."
ssh "$PI_HOST" "mkdir -p $PI_DIR"
scp "$JAR" "$PI_HOST:$PI_DIR/minicrm.jar"
scp docker-compose.yml "$PI_HOST:$PI_DIR/"
scp minicrm.service "$PI_HOST:$PI_DIR/"

# ── 5. Dienst neu starten ───────────────────────────────────────────
echo "→ Dienst einrichten..."
ssh "$PI_HOST" "sudo cp $PI_DIR/minicrm.service /etc/systemd/system/ \
  && sudo systemctl daemon-reload \
  && sudo systemctl enable minicrm \
  && sudo systemctl restart minicrm"

# ── 6. Nachsehen, ob er auch wirklich laeuft ────────────────────────
echo "→ Warte auf Start..."
sleep 8
if ssh "$PI_HOST" "systemctl is-active --quiet minicrm"; then
  echo ""
  echo "=== Fertig — App laeuft auf http://100.120.87.43:8080 ==="
  ssh "$PI_HOST" "journalctl -u minicrm -n 3 --no-pager | tail -3" || true
else
  echo ""
  echo "ACHTUNG: Dienst laeuft nach dem Neustart nicht."
  ssh "$PI_HOST" "journalctl -u minicrm -n 30 --no-pager" || true
  exit 1
fi
echo "    Logs: ssh $PI_HOST 'journalctl -u minicrm -f'"
