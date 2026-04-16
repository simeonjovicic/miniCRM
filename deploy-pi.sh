#!/bin/bash
set -e

PI_HOST="${1:-pi@raspberrypi.local}"
PI_DIR="/home/pi/minicrm"

echo "=== MiniCRM — Build & Deploy auf Pi ==="

# 1. Frontend bauen
echo "→ Frontend bauen..."
cd frontend
npm run build
cd ..

# 2. Frontend in Backend kopieren
echo "→ Frontend in Backend kopieren..."
rm -rf backend/src/main/resources/static
cp -r frontend/dist backend/src/main/resources/static

# 3. Backend JAR bauen (lokal, schnell)
echo "→ Backend JAR bauen..."
cd backend
./mvnw clean package -DskipTests -q
cd ..

JAR="backend/target/collab-crm-0.0.1-SNAPSHOT.jar"
echo "→ JAR gebaut: $JAR ($(du -h "$JAR" | cut -f1))"

# 4. Auf Pi deployen
echo "→ Deploy auf $PI_HOST..."
ssh "$PI_HOST" "mkdir -p $PI_DIR"
scp "$JAR" "$PI_HOST:$PI_DIR/minicrm.jar"
scp docker-compose.yml "$PI_HOST:$PI_DIR/"
scp minicrm.service "$PI_HOST:$PI_DIR/"

# 5. Service neustarten
echo "→ Service neustarten..."
ssh "$PI_HOST" "cd $PI_DIR && docker compose up -d && sudo systemctl restart minicrm"

echo ""
echo "=== Fertig! App läuft auf http://$(echo $PI_HOST | cut -d@ -f2):8080 ==="
