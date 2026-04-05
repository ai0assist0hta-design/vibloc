#!/bin/bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
cd "$(dirname "$0")"
exec bun run dev --port ${PORT:-5173}
