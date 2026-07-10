#!/bin/bash

# Start API server
PORT=5000 NODE_ENV=development pnpm --filter @workspace/api-server dev &

# Start frontend
PORT=5173 BASE_PATH=/ NODE_ENV=development pnpm --filter @workspace/bracket-boss dev &

# Keep container alive
wait
