#!/bin/bash

# Script to run the Docker container for implementing the plan

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
  exit 1
fi

# Check if implement_plan_prompt.md exists
if [ ! -f "implement_plan_prompt.md" ]; then
  echo -e "${YELLOW}Warning: implement_plan_prompt.md not found in current directory${NC}"
fi

echo -e "${BLUE}Building Docker image...${NC}"
docker build -t ai-notebook-implementer .

echo -e "${GREEN}✓ Docker image built successfully${NC}"
echo ""

# Create .claude directory in home if it doesn't exist (for auth persistence)
mkdir -p "$HOME/.claude"

# Check if user wants to authenticate first
if [ "$1" = "login" ]; then
  echo -e "${GREEN}Starting interactive Claude CLI login...${NC}"
  echo -e "${YELLOW}Follow the prompts to authenticate${NC}"
  echo ""
  docker run --rm -it \
    -v "$(pwd):/workspace" \
    -v "$HOME/.claude:/root/.claude" \
    -w /workspace \
    ai-notebook-implementer \
    claude login
  echo ""
  echo -e "${GREEN}✓ Authentication complete!${NC}"
  echo -e "${BLUE}Run ./docker-run.sh to start the implementation loop${NC}"
  exit 0
fi

# Check if user wants a shell
if [ "$1" = "shell" ] || [ "$1" = "bash" ]; then
  echo -e "${GREEN}Starting interactive shell...${NC}"
  docker run --rm -it \
    -v "$(pwd):/workspace" \
    -v "$HOME/.claude:/root/.claude" \
    -w /workspace \
    ai-notebook-implementer \
    /bin/bash
  exit 0
fi

# Run the container
# -v mounts the current directory so changes persist
# -v mounts .claude config directory to persist authentication
# --rm removes container when stopped
# -it for interactive terminal
echo -e "${GREEN}Starting container...${NC}"
echo -e "${YELLOW}The container will run Claude CLI in a loop with --dangerously-skip-permissions${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""
docker run --rm -it \
  -v "$(pwd):/workspace" \
  -v "$HOME/.claude:/root/.claude" \
  -w /workspace \
  ai-notebook-implementer
