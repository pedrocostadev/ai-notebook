#!/bin/sh

# Check if Claude is authenticated
if [ ! -f "$HOME/.claude/settings.json" ]; then
  echo "⚠️  Claude CLI not authenticated."
  echo ""
  echo "Please authenticate by running:"
  echo "  ./docker-run.sh login"
  exit 1
fi

# Check if implement_plan_prompt.md exists
if [ ! -f "implement_plan_prompt.md" ]; then
  echo "❌ Error: implement_plan_prompt.md not found in workspace"
  exit 1
fi

# Start Xvfb in background for headless Electron
echo "Starting Xvfb for headless Electron..."
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
XVFB_PID=$!

# Wait a moment to ensure Xvfb started
sleep 1

# Verify Xvfb is running
if ! kill -0 $XVFB_PID 2>/dev/null; then
  echo "⚠️  Warning: Xvfb may not have started correctly"
fi

# Trap SIGTERM and SIGINT for graceful shutdown
trap "echo ''; echo 'Stopping...'; kill $XVFB_PID 2>/dev/null; exit 0" TERM INT

# Run the Claude loop
echo "🚀 Starting Claude CLI implementation loop..."
echo "📝 Reading from: implement_plan_prompt.md"
echo "🛑 Press Ctrl+C to stop"
echo ""

# Counter for iterations
ITERATION=0

while :; do
  ITERATION=$((ITERATION + 1))
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iteration $ITERATION"
  
  # Run Claude CLI with error handling
  if ! cat implement_plan_prompt.md | claude -p --dangerously-skip-permissions; then
    echo "⚠️  Claude CLI returned an error. Continuing in 5 seconds..."
    sleep 5
  else
    sleep 1
  fi
done
