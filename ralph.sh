#!/usr/bin/env bash
# ralph.sh
# Usage: ./ralph.sh <iterations>

set -euo pipefail

iterations="${1:-}"
if [[ -z "$iterations" ]]; then
  echo "Usage: $0 <iterations>" >&2
  exit 1
fi
if ! [[ "$iterations" =~ ^[0-9]+$ ]] || [[ "$iterations" -lt 1 ]]; then
  echo "Iterations must be a positive integer." >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
prompt_file="$script_dir/prompt.md"
if [[ ! -f "$prompt_file" ]]; then
  echo "Missing prompt file: $prompt_file" >&2
  exit 1
fi

# For each iteration, run Claude Code with the prompt from prompt.md
for ((i=1; i<=iterations; i++)); do
  echo "========================================="
  echo "[Iteration $i/$iterations] Starting at $(date)"
  echo "========================================="

  # Per Docker docs, you can pass a prompt directly as an argument.
  # This keeps stdin attached to the TTY (important if Claude prompts on first run).
  prompt="$(cat "$prompt_file")"

  # Capture output (for stop condition) while still printing it.
  result="$(docker sandbox run claude "$prompt" 2>&1 | tee /dev/stderr)"

  echo ""
  echo "[Iteration $i/$iterations] Completed at $(date)"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "PRD complete, exiting."
    exit 0
  fi

  echo ""
done

echo "All $iterations iterations completed."
