#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$REPO_ROOT/antigravity-service"
SERVER_ENV="$REPO_ROOT/server/.env.local"
SECRETS_FILE="$REPO_ROOT/scripts/.antigravity-env"

# ─── Load secrets from local file (never committed) ──────────────────────────

if [ ! -f "$SECRETS_FILE" ]; then
  cat > "$SECRETS_FILE" <<'EOF'
OPENROUTER_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
CARTESIA_API_KEY=
CARTESIA_VOICE_ID=
REDIS_URL=
OPENROUTER_SMALL_MODEL=anthropic/claude-haiku-4-5
OPENROUTER_MEDIUM_MODEL=anthropic/claude-sonnet-4-5
OPENROUTER_LARGE_MODEL=deepseek/deepseek-r1
ANTIGRAVITY_CORS_ORIGINS=http://localhost:5173
PORT=8001
EOF
  echo ""
  echo "  Created $SECRETS_FILE"
  echo "  Fill in the values then re-run this script."
  echo ""
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$SECRETS_FILE"
set +a

# ─── Wire ProvenHire server to point at this service ─────────────────────────

PORT="${PORT:-8001}"

if ! grep -q "ANTIGRAVITY_API_BASE_URL" "$SERVER_ENV" 2>/dev/null; then
  echo "ANTIGRAVITY_API_BASE_URL=http://localhost:$PORT" >> "$SERVER_ENV"
  echo "[start-antigravity] Added ANTIGRAVITY_API_BASE_URL to $SERVER_ENV"
else
  sed -i '' "s|ANTIGRAVITY_API_BASE_URL=.*|ANTIGRAVITY_API_BASE_URL=http://localhost:$PORT|" "$SERVER_ENV"
fi

# ─── Deps ─────────────────────────────────────────────────────────────────────

cd "$SERVICE_DIR"

if ! command -v uvicorn &>/dev/null; then
  echo "[start-antigravity] Installing deps..."
  pip install -r requirements.txt
fi

# ─── Start ────────────────────────────────────────────────────────────────────

echo ""
echo "  Antigravity service → http://localhost:$PORT"
echo "  Docs               → http://localhost:$PORT/docs"
echo "  ProvenHire wired   → ANTIGRAVITY_API_BASE_URL=http://localhost:$PORT"
echo ""

exec uvicorn main:app --host 0.0.0.0 --port "$PORT" --reload
