#!/usr/bin/env bash
set -euo pipefail

IMAGE="kampeerhub"
CONTAINER="kampeerhub"

if [[ "${1:-}" == "--build" ]] || ! docker image inspect "$IMAGE" &>/dev/null; then
  echo "Building Docker image..."
  docker build -t "$IMAGE" .
fi

if docker ps -q -f name="$CONTAINER" | grep -q .; then
  echo "Container already running at http://localhost:8000"
  exit 0
fi

docker run -d \
  --name "$CONTAINER" \
  --rm \
  -p 8000:8000 \
  -v kampeerhub-data:/app/database \
  --env-file .env \
  "$IMAGE"

echo "kampeerhub running at http://localhost:8000"
