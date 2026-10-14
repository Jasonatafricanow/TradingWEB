#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"


start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    # server.ts runs Next in dev mode (and auth-local accepts the public
    # default JWT secret) unless NODE_ENV is production.
    NODE_ENV="${NODE_ENV:-production}" PORT=${DEPLOY_RUN_PORT} node dist/server.js
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
