# Docker Setup Instructions

This Docker setup creates a sandboxed environment to run Claude CLI with `--dangerously-skip-permissions` for implementing the PLAN.md.

## Quick Start

### First Time Setup (Authentication Required)

Run the login command to authenticate with Claude CLI:

```bash
./docker-run.sh login
```

This will start an interactive session where you can authenticate. Your credentials will be saved to `~/.claude/` and persist across container runs.

### Running the Implementation Loop

After authentication:

```bash
./docker-run.sh
```

That's it! The script will:

- Mount your workspace (so changes persist)
- Mount your Claude CLI config (so auth persists)
- Run Claude CLI in an infinite loop implementing PLAN.md

---

## Prerequisites

1. **Docker** installed and running
2. **Claude account** (for authentication)

## Authentication

### Interactive Login

Run the login command once:

```bash
./docker-run.sh login
```

This mounts your `~/.claude/` directory into the container, so your authentication persists. You only need to do this once (or if your session expires).

### Manual Docker Run

If you prefer to run Docker manually:

```bash
# For login
docker run --rm -it \
  -v "$(pwd):/workspace" \
  -v "$HOME/.claude:/root/.claude" \
  -w /workspace \
  ai-notebook-implementer \
  claude login

# For running the loop
docker run --rm -it \
  -v "$(pwd):/workspace" \
  -v "$HOME/.claude:/root/.claude" \
  -w /workspace \
  ai-notebook-implementer
```

## Additional Commands

### Interactive Shell

To get an interactive shell inside the container for debugging:

```bash
./docker-run.sh shell
```

or

```bash
./docker-run.sh bash
```

## What the Container Does

- Sets up Node.js 20 LTS environment
- Installs Git and development tools
- Installs all dependencies needed for Electron (native modules, system libraries)
- Sets up Xvfb for headless Electron execution
- Runs Claude CLI in an infinite loop, reading from `implement_plan_prompt.md`
- Mounts your workspace so all changes persist on your host machine
- Includes error handling and graceful shutdown on Ctrl+C

## Stopping the Container

Press `Ctrl+C` to stop the container. The `--rm` flag ensures it's automatically cleaned up.

## How Authentication Works

Claude CLI stores authentication credentials in `~/.claude/settings.json`. The Docker setup:

1. **Mounts your host's `~/.claude/` directory** into the container at `/root/.claude/`
2. **Persists authentication** across container runs
3. **Checks for authentication** before starting the loop (will show helpful error if not authenticated)

This means:

- ✅ You only need to authenticate once
- ✅ Your credentials persist even if you rebuild the container
- ✅ Multiple containers can share the same auth (if needed)

## Troubleshooting

- **"Claude CLI not authenticated" error**: Run `./docker-run.sh login` to authenticate.
- **Permission errors**: The container runs as root inside, but mounts preserve your host file permissions. If you encounter issues, check that `~/.claude/` is readable.
- **Authentication expired**: If your session expires, just run `./docker-run.sh login` again to re-authenticate.
- **Electron errors**: Xvfb is started automatically for headless operation. If you see display errors, check that Xvfb is running inside the container.
- **Build errors**: If npm install fails, check your internet connection and ensure Docker has enough resources allocated.

## What Gets Installed

- **Node.js 20 LTS**: Base runtime environment
- **Claude CLI** (`@anthropic-ai/claude-code`): Installed globally via npm during build
- **Git**: Version control (useful for tracking implementation progress)
- **Development tools**: curl, ca-certificates for better tooling support
- **System dependencies**: All libraries needed for Electron and native modules
- **Xvfb**: Virtual framebuffer for headless Electron execution

## Improvements Based on Anthropic's Devcontainer

This setup incorporates best practices from Anthropic's official devcontainer:

- ✅ **Git included** - Track changes during implementation
- ✅ **Better error handling** - Validates files and checks before running
- ✅ **Graceful shutdown** - Proper signal handling for Ctrl+C
- ✅ **Enhanced logging** - Timestamps and iteration counters
- ✅ **Health checks** - Verifies Xvfb started correctly
- ✅ **Interactive shell support** - Debug with `./docker-run.sh shell`
