#!/usr/bin/env bash
set -euo pipefail
docker stop kampeerhub 2>/dev/null && echo "Stopped." || echo "Container not running."
