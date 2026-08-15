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
# sed statt grep -oP: -P gibt es im grep von macOS nicht, das warf jedes Mal
# eine Fehlermeldung samt Hilfetext aus, obwohl der Rueckfallweg griff.
SERVICE_DIR=$(sed -n 's/^WorkingDirectory=//p' minicrm.service)
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
# sudo auf dem Pi verlangt ein Passwort, und ohne Terminal bricht es mit
# "a terminal is required to read the password" ab. Deshalb -t: damit wird
# ein Terminal durchgereicht und die Abfrage erscheint hier. Einmal tippen
# genuegt, sudo merkt es sich fuer die restlichen Befehle der Kette.
echo "→ Dienst einrichten (sudo-Passwort des Pi wird gleich abgefragt)..."
ssh -t "$PI_HOST" "sudo cp $PI_DIR/minicrm.service /etc/systemd/system/ \
  && sudo systemctl daemon-reload \
  && sudo systemctl enable minicrm \
  && sudo systemctl restart minicrm"

# ── 6. Nachsehen, ob er auch wirklich laeuft ────────────────────────
#
# Geprueft wird per HTTP und nicht ueber systemctl: "aktiv" heisst nur, dass
# der Prozess laeuft — nicht, dass Spring hochgekommen ist und ausliefert.
# Ausserdem kaeme systemctl als normaler Benutzer ueber SSH nicht an den DBus
# und meldete faelschlich "laeuft nicht".
#
# Gewartet wird in Schritten statt fix: auf dem Pi dauert der Start deutlich
# laenger als lokal, und ein starres sleep ist entweder zu kurz oder vergeudet
# jedes Mal Zeit.
echo "→ Warte auf Start..."
BEREIT=0
for _ in $(seq 1 30); do
  if ssh "$PI_HOST" "curl -sf -o /dev/null -m 3 http://localhost:8080/api/auth/users" 2>/dev/null; then
    BEREIT=1
    break
  fi
  sleep 3
done

if [ "$BEREIT" = "1" ]; then
  echo ""
  echo "=== Fertig — App laeuft auf http://100.120.87.43:8080 ==="
else
  echo ""
  echo "ACHTUNG: App antwortet nach 90 Sekunden nicht. Letzte Logzeilen:"
  ssh -t "$PI_HOST" "sudo journalctl -u minicrm -n 30 --no-pager" || true
  exit 1
fi
# journalctl liest hier nur root — der Benutzer ist nicht in systemd-journal.
echo "    Logs: ssh $PI_HOST 'sudo journalctl -u minicrm -f'"
