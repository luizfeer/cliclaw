#!/usr/bin/env bash
set -euo pipefail

# ─── colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}${BOLD}→${RESET} $*"; }
success() { echo -e "${GREEN}${BOLD}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}${BOLD}⚠${RESET} $*"; }
error()   { echo -e "${RED}${BOLD}✖${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}${BLUE}$*${RESET}\n"; }
ask()     { echo -e "${BOLD}$*${RESET}"; }

# ─── banner ───────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'
  ____  _ _        ____  _               
 / ___|| (_)      / ___|| | __ ___      __
| |    | | |_____| |    | |/ _` \ \ /\ / /
| |___ | | |_____| |___ | | (_| |\ V  V / 
 \____||_|_|      \____||_|\__,_| \_/\_/  

BANNER
echo -e "${RESET}${BOLD}  Telegram bridge for AI CLIs — installer${RESET}\n"
echo -e "  ${CYAN}github.com/luizfeer/cliclaw${RESET}\n"

# ─── os check ─────────────────────────────────────────────────────────────────
header "1/7 — System check"
OS="$(uname -s)"
if [[ "$OS" != "Linux" && "$OS" != "Darwin" ]]; then
  error "Unsupported OS: $OS. Linux or macOS required."
  exit 1
fi
success "OS: $OS $(uname -m)"

# ─── node.js ──────────────────────────────────────────────────────────────────
header "2/7 — Node.js"
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [[ "$MAJOR" -ge 18 ]]; then
    success "Node.js $NODE_VER already installed"
  else
    warn "Node.js $NODE_VER found but v18+ is required. Upgrading..."
    INSTALL_NODE=1
  fi
else
  warn "Node.js not found. Installing v22..."
  INSTALL_NODE=1
fi

if [[ "${INSTALL_NODE:-0}" == "1" ]]; then
  if [[ "$OS" == "Linux" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    error "Please install Node.js 22 manually from https://nodejs.org"
    exit 1
  fi
  success "Node.js $(node --version) installed"
fi

# ─── npm global prefix (no sudo) ─────────────────────────────────────────────
NPM_GLOBAL="$HOME/.npm-global"
mkdir -p "$NPM_GLOBAL"
npm config set prefix "$NPM_GLOBAL" 2>/dev/null || true

# Add to PATH for this session
export PATH="$NPM_GLOBAL/bin:$PATH"

# Persist to shell rc
SHELL_RC=""
if [[ -f "$HOME/.zshrc" ]];  then SHELL_RC="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then SHELL_RC="$HOME/.bashrc"
elif [[ -f "$HOME/.bash_profile" ]]; then SHELL_RC="$HOME/.bash_profile"
fi

if [[ -n "$SHELL_RC" ]]; then
  if ! grep -q '.npm-global/bin' "$SHELL_RC" 2>/dev/null; then
    echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$SHELL_RC"
    success "Added ~/.npm-global/bin to $SHELL_RC"
  fi
fi

# ─── clone repo ───────────────────────────────────────────────────────────────
header "3/7 — Cli-Claw"

ask "Where should Cli-Claw be installed? [default: ~/cliclaw]"
read -r INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$HOME/cliclaw}"
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Existing repo found at $INSTALL_DIR — pulling latest..."
  git -C "$INSTALL_DIR" pull origin master
else
  info "Cloning to $INSTALL_DIR..."
  git clone https://github.com/luizfeer/cliclaw.git "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
success "Repo ready at $INSTALL_DIR"

info "Installing npm dependencies..."
npm install --silent
success "Dependencies installed"

info "Installing tsx and pm2 globally..."
npm install -g tsx pm2 --silent 2>/dev/null || \
  npm install -g tsx pm2 2>&1 | tail -3
success "tsx and pm2 ready"

# ─── AI CLIs ──────────────────────────────────────────────────────────────────
header "4/7 — AI CLI agents"

INSTALL_CLAUDE=0
INSTALL_CODEX=0

echo -e "Available agents:\n"
echo -e "  ${CYAN}🟣 Claude Code${RESET} — requires claude.ai subscription (free or Pro)"
echo -e "  ${CYAN}🟢 Codex${RESET}       — requires OpenAI/ChatGPT account"
echo -e "  ${YELLOW}🔜 OpenCode${RESET}    — coming soon\n"

ask "Install Claude Code? [Y/n]"
read -r REPLY
[[ "${REPLY:-Y}" =~ ^[Yy]$ ]] && INSTALL_CLAUDE=1

ask "Install Codex? [y/N]"
read -r REPLY
[[ "${REPLY:-N}" =~ ^[Yy]$ ]] && INSTALL_CODEX=1

if [[ "$INSTALL_CLAUDE" == "1" ]]; then
  if command -v claude &>/dev/null; then
    success "Claude Code already installed: $(claude --version 2>/dev/null || echo 'ok')"
  else
    info "Installing Claude Code CLI..."
    npm install -g @anthropic-ai/claude-code
    success "Claude Code installed"
  fi
  echo ""
  warn "You need to authenticate Claude Code (one-time):"
  echo -e "  ${BOLD}It will open a login link — complete in your browser.${RESET}"
  ask "Run 'claude' login now? [Y/n]"
  read -r REPLY
  if [[ "${REPLY:-Y}" =~ ^[Yy]$ ]]; then
    claude || warn "Authentication may require manual completion. Run 'claude' later."
  else
    warn "Remember to run: claude"
  fi
fi

if [[ "$INSTALL_CODEX" == "1" ]]; then
  if command -v codex &>/dev/null; then
    success "Codex already installed"
  else
    info "Installing Codex CLI..."
    npm install -g @openai/codex
    success "Codex installed"
  fi
  echo ""
  warn "You need to authenticate Codex (one-time):"
  ask "Run 'codex login' now? [Y/n]"
  read -r REPLY
  if [[ "${REPLY:-Y}" =~ ^[Yy]$ ]]; then
    codex login || warn "Run 'codex login' manually later."
  else
    warn "Remember to run: codex login"
  fi
fi

if [[ "$INSTALL_CLAUDE" == "0" && "$INSTALL_CODEX" == "0" ]]; then
  warn "No CLI installed. The bot will start but show setup instructions until you add one."
fi

# ─── .env config ──────────────────────────────────────────────────────────────
header "5/7 — Configuration"

ENV_FILE="$INSTALL_DIR/.env"

# Telegram bot token
echo -e "${BOLD}Telegram Bot Token${RESET}"
echo -e "  Get one from @BotFather → /newbot\n"
ask "Enter your TELEGRAM_BOT_TOKEN:"
read -r BOT_TOKEN
while [[ -z "$BOT_TOKEN" ]]; do
  warn "Token cannot be empty."
  ask "Enter your TELEGRAM_BOT_TOKEN:"
  read -r BOT_TOKEN
done

# Forum group ID
echo ""
echo -e "${BOLD}Telegram Forum Group ID${RESET} ${YELLOW}(optional — needed for forum topics)${RESET}"
echo -e "  1. Create a Telegram group"
echo -e "  2. Enable Topics: Edit group → Topics → Enable"
echo -e "  3. Add your bot as Admin with 'Manage Topics' permission"
echo -e "  4. Start the bot first, send /id in the group to get the ID\n"
ask "Enter FORUM_GROUP_ID (leave empty to skip):"
read -r FORUM_ID

# Permission mode
echo ""
echo -e "${BOLD}Permission mode for AI models${RESET}\n"
echo -e "  ${BOLD}1) auto${RESET}    — always skip all permission prompts ${CYAN}(recommended for personal VPS)${RESET}"
echo -e "  ${BOLD}2) session${RESET} — ask when creating each /new session"
echo -e "  ${BOLD}3) ask${RESET}     — restricted by default; prefix message with ! to allow\n"
ask "Choose [1/2/3, default: 1]:"
read -r PERM_CHOICE
case "${PERM_CHOICE:-1}" in
  2) PERM_MODE="session" ;;
  3) PERM_MODE="ask" ;;
  *) PERM_MODE="auto" ;;
esac
success "Permission mode: $PERM_MODE"

# Write .env
{
  echo "TELEGRAM_BOT_TOKEN=$BOT_TOKEN"
  [[ -n "$FORUM_ID" ]] && echo "FORUM_GROUP_ID=$FORUM_ID"
  echo "PERMISSION_MODE=$PERM_MODE"
  echo "DATA_DIR=$INSTALL_DIR/data"
} > "$ENV_FILE"
success ".env written to $ENV_FILE"

# ─── Telegram group setup reminder ───────────────────────────────────────────
if [[ -z "$FORUM_ID" ]]; then
  echo ""
  warn "Forum mode not configured yet."
  echo -e "  After starting the bot:"
  echo -e "  1. Add it to a Telegram group with Topics enabled"
  echo -e "  2. Send ${BOLD}/id${RESET} in that group"
  echo -e "  3. Add the Chat ID to $ENV_FILE as ${BOLD}FORUM_GROUP_ID=<id>${RESET}"
  echo -e "  4. Run: ${BOLD}pm2 restart cliclaw${RESET}"
fi

# ─── PM2 ─────────────────────────────────────────────────────────────────────
header "6/7 — Process manager (PM2)"

ask "Start Cli-Claw with PM2 and enable auto-start on reboot? [Y/n]"
read -r REPLY
if [[ "${REPLY:-Y}" =~ ^[Yy]$ ]]; then
  cd "$INSTALL_DIR"
  pm2 delete cliclaw 2>/dev/null || true
  pm2 start ecosystem.config.js
  pm2 save
  STARTUP_CMD=$(pm2 startup 2>&1 | grep 'sudo' | tail -1)
  if [[ -n "$STARTUP_CMD" ]]; then
    echo ""
    warn "Run this command to enable boot auto-start:"
    echo -e "  ${BOLD}${STARTUP_CMD}${RESET}"
    echo ""
    ask "Run it now? (requires sudo) [Y/n]"
    read -r REPLY
    if [[ "${REPLY:-Y}" =~ ^[Yy]$ ]]; then
      eval "$STARTUP_CMD" && success "Boot auto-start enabled"
    fi
  fi
  success "Cli-Claw is running via PM2"
else
  echo ""
  info "To start manually:"
  echo -e "  cd $INSTALL_DIR && npx tsx index.ts"
  echo ""
  info "To start with PM2:"
  echo -e "  cd $INSTALL_DIR && pm2 start ecosystem.config.js && pm2 save"
fi

# ─── done ─────────────────────────────────────────────────────────────────────
header "7/7 — Done!"

echo -e "${GREEN}${BOLD}Cli-Claw installed successfully!${RESET}\n"
echo -e "  📁 Location:   ${BOLD}$INSTALL_DIR${RESET}"
echo -e "  ⚙️  Config:     ${BOLD}$ENV_FILE${RESET}"
echo -e "  📋 PM2 status: ${BOLD}pm2 status${RESET}"
echo -e "  📜 Logs:       ${BOLD}pm2 logs cliclaw${RESET}"
echo -e "  🔄 Restart:    ${BOLD}pm2 restart cliclaw${RESET}"
echo ""
echo -e "  ${CYAN}Open Telegram and send /start to your bot!${RESET}"

if [[ -z "$FORUM_ID" ]]; then
  echo ""
  warn "Don't forget to set FORUM_GROUP_ID in .env and restart."
fi

echo ""
