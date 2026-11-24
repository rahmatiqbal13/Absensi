#!/bin/bash
# Pasang / lepas jembatan mesin absensi sebagai LaunchAgent macOS:
# berjalan otomatis setiap login dan hidup lagi bila berhenti.
#
#   bash pasang-macos.sh          pasang (atau perbarui) dan jalankan
#   bash pasang-macos.sh lepas    hentikan dan hapus
#   bash pasang-macos.sh status   lihat status & log terakhir
set -euo pipefail

LABEL="id.tapabsen.mesin-bridge"
DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mesin-bridge.log"
DOMAIN="gui/$(id -u)"

case "${1:-pasang}" in
  lepas)
    launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Jembatan dihentikan dan dilepas. (antrian.json & bridge.env tidak dihapus)"
    exit 0
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E "^\s*(state|pid|last exit code)" || echo "Belum terpasang."
    echo "--- log terakhir ($LOG)"
    tail -n 15 "$LOG" 2>/dev/null || true
    exit 0
    ;;
  pasang) ;;
  *) echo "Pakai: bash pasang-macos.sh [pasang|lepas|status]"; exit 1 ;;
esac

NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "Node.js tidak ditemukan. Pasang dari nodejs.org atau 'brew install node'."; exit 1; }
[ -f "$DIR/bridge.env" ] || { echo "Buat $DIR/bridge.env dulu (salin dari bridge.env.example)."; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/bridge.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null

# Hentikan jembatan LaunchAgent yang lama dulu (pembaruan), baru periksa port:
# yang masih memegang port setelah itu adalah jembatan lain (mis. manual di Terminal).
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
PORT="$(grep -E '^PUSH_PORT=' "$DIR/bridge.env" | cut -d= -f2 || true)"
for _ in 1 2 3 4 5; do
  lsof -t -iTCP:"${PORT:-8014}" -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
if lsof -t -iTCP:"${PORT:-8014}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT:-8014} sedang dipakai proses lain (jembatan manual?). Hentikan dulu (Ctrl+C di Terminal-nya), lalu ulangi."
  exit 1
fi

launchctl bootstrap "$DOMAIN" "$PLIST"
sleep 2
echo "Jembatan terpasang dan berjalan. Log: $LOG"
tail -n 5 "$LOG" 2>/dev/null || true
echo
echo "Bila macOS menanyakan izin jaringan lokal / koneksi masuk untuk 'node', pilih Izinkan."
