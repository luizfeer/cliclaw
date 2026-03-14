# Cli-Claw installer Installer
# Run with: irm https://raw.githubusercontent.com/luizfeer/cliclaw/master/install.ps1 | iex
# Or: Set-ExecutionPolicy Bypass -Scope Process; .\install.ps1

$ErrorActionPreference = "Stop"

# ─── colors ──────────────────────────────────────────────────────────────────
function Write-Header($msg) { Write-Host "`n$msg" -ForegroundColor Cyan -NoNewline; Write-Host "" }
function Write-Ok($msg)     { Write-Host "✔ $msg" -ForegroundColor Green }
function Write-Info($msg)   { Write-Host "→ $msg" -ForegroundColor Cyan }
function Write-Warn($msg)   { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Err($msg)    { Write-Host "✖ $msg" -ForegroundColor Red }
function Ask($msg, $default="") {
    Write-Host $msg -ForegroundColor White -NoNewline
    if ($default) { Write-Host " [default: $default]" -ForegroundColor DarkGray -NoNewline }
    Write-Host ": " -NoNewline
    $r = Read-Host
    if ($r -eq "" -and $default -ne "") { return $default }
    return $r
}
function AskYN($msg, $default="Y") {
    $hint = if ($default -eq "Y") { "[Y/n]" } else { "[y/N]" }
    Write-Host "$msg $hint " -NoNewline -ForegroundColor White
    $r = Read-Host
    if ($r -eq "") { $r = $default }
    return $r -match "^[Yy]"
}

# ─── banner ───────────────────────────────────────────────────────────────────
Clear-Host
Write-Host @"

   ____ _ _        ____  _
  / ___|| (_)      / ___|| | __ ___      __
 | |    | | |_____| |    | |/ _' \ \ /\ / /
 | |___ | | |_____| |___ | | (_| |\ V  V /
  \____||_|_|      \____||_|\__,_| \_/\_/

  Telegram bridge for AI CLIs — Windows installer
  github.com/luizfeer/cliclaw

"@ -ForegroundColor Cyan

# ─── 1. node.js ───────────────────────────────────────────────────────────────
Write-Header "1/6 — Node.js"

$nodeOk = $false
try {
    $nodeVer = (node --version 2>$null)
    $major = [int]($nodeVer -replace 'v(\d+).*','$1')
    if ($major -ge 18) {
        Write-Ok "Node.js $nodeVer already installed"
        $nodeOk = $true
    } else {
        Write-Warn "Node.js $nodeVer found but v18+ required."
    }
} catch { Write-Warn "Node.js not found." }

if (-not $nodeOk) {
    Write-Info "Attempting to install Node.js 22 via winget..."
    try {
        winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Ok "Node.js installed. You may need to restart your terminal after setup."
    } catch {
        Write-Err "Could not install automatically."
        Write-Host "  Please install Node.js from: https://nodejs.org/en/download" -ForegroundColor Yellow
        Write-Host "  Then re-run this installer." -ForegroundColor Yellow
        exit 1
    }
}

# ─── 2. git ───────────────────────────────────────────────────────────────────
Write-Header "2/6 — Git"
try {
    $gitVer = (git --version 2>$null)
    Write-Ok $gitVer
} catch {
    Write-Warn "Git not found. Installing via winget..."
    try {
        winget install Git.Git --silent --accept-source-agreements --accept-package-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Ok "Git installed."
    } catch {
        Write-Err "Could not install Git. Please install from https://git-scm.com"
        exit 1
    }
}

# ─── 3. clone ─────────────────────────────────────────────────────────────────
Write-Header "3/6 — Cli-Claw"

$defaultDir = "$env:USERPROFILE\cliclaw"
$installDir = Ask "Install location" $defaultDir
if ($installDir -eq "") { $installDir = $defaultDir }

if (Test-Path "$installDir\.git") {
    Write-Info "Existing repo found — pulling latest..."
    git -C $installDir pull origin master
} else {
    Write-Info "Cloning to $installDir..."
    git clone https://github.com/luizfeer/cliclaw.git $installDir
}

Set-Location $installDir
Write-Ok "Repo ready at $installDir"

Write-Info "Installing npm dependencies..."
npm install --silent
Write-Ok "Dependencies installed"

Write-Info "Installing tsx and pm2 globally..."
npm install -g tsx pm2 2>&1 | Select-Object -Last 3
Write-Ok "tsx and pm2 ready"

# ─── 4. AI CLIs ───────────────────────────────────────────────────────────────
Write-Header "4/6 — AI CLI agents"

Write-Host "`n  🟣 Claude Code  — requires claude.ai subscription" -ForegroundColor Cyan
Write-Host "  🟢 Codex        — requires OpenAI/ChatGPT account" -ForegroundColor Cyan
Write-Host "  🔜 OpenCode     — coming soon`n" -ForegroundColor Yellow

$installClaude = AskYN "Install Claude Code?" "Y"
$installCodex  = AskYN "Install Codex?" "N"

if ($installClaude) {
    $claudeExists = $false
    try { claude --version 2>$null | Out-Null; $claudeExists = $true } catch {}
    if ($claudeExists) {
        Write-Ok "Claude Code already installed"
    } else {
        Write-Info "Installing Claude Code CLI..."
        npm install -g @anthropic-ai/claude-code
        Write-Ok "Claude Code installed"
    }
    Write-Host ""
    Write-Warn "You need to authenticate Claude Code (opens browser login):"
    if (AskYN "Run 'claude' login now?" "Y") {
        try { claude } catch { Write-Warn "Run 'claude' manually in a new terminal." }
    } else {
        Write-Warn "Remember to run: claude"
    }
}

if ($installCodex) {
    $codexExists = $false
    try { codex --version 2>$null | Out-Null; $codexExists = $true } catch {}
    if ($codexExists) {
        Write-Ok "Codex already installed"
    } else {
        Write-Info "Installing Codex CLI..."
        npm install -g @openai/codex
        Write-Ok "Codex installed"
    }
    Write-Host ""
    if (AskYN "Run 'codex login' now?" "Y") {
        try { codex login } catch { Write-Warn "Run 'codex login' manually." }
    } else {
        Write-Warn "Remember to run: codex login"
    }
}

if (-not $installClaude -and -not $installCodex) {
    Write-Warn "No CLI installed. Bot will show setup instructions until you add one."
}

# ─── 5. .env ──────────────────────────────────────────────────────────────────
Write-Header "5/6 — Configuration"

Write-Host "`nTelegram Bot Token" -ForegroundColor White
Write-Host "  Get one from @BotFather → /newbot`n" -ForegroundColor DarkGray
$botToken = ""
while ($botToken -eq "") {
    $botToken = Ask "TELEGRAM_BOT_TOKEN"
    if ($botToken -eq "") { Write-Warn "Token cannot be empty." }
}

Write-Host "`nForum Group ID " -ForegroundColor White -NoNewline
Write-Host "(optional — needed for forum topics)" -ForegroundColor DarkGray
Write-Host "  Start bot first, send /id in your group, paste the Chat ID here." -ForegroundColor DarkGray
Write-Host "  Leave empty to skip and configure later.`n" -ForegroundColor DarkGray
$forumId = Ask "FORUM_GROUP_ID (or Enter to skip)" ""

Write-Host "`nPermission mode for AI models`n" -ForegroundColor White
Write-Host "  1) auto    — always skip all permission prompts (recommended)" -ForegroundColor Cyan
Write-Host "  2) session — ask when creating each /new session" -ForegroundColor Cyan
Write-Host "  3) ask     — restricted by default; prefix message with ! to allow`n" -ForegroundColor Cyan
$permChoice = Ask "Choose [1/2/3]" "1"
$permMode = switch ($permChoice) {
    "2" { "session" }
    "3" { "ask" }
    default { "auto" }
}
Write-Ok "Permission mode: $permMode"

$envContent = "TELEGRAM_BOT_TOKEN=$botToken`n"
if ($forumId -ne "") { $envContent += "FORUM_GROUP_ID=$forumId`n" }
$envContent += "PERMISSION_MODE=$permMode`n"
$envContent += "DATA_DIR=$installDir\data`n"
$envContent | Set-Content "$installDir\.env" -Encoding UTF8
Write-Ok ".env written"

# ─── 6. PM2 ───────────────────────────────────────────────────────────────────
Write-Header "6/6 — Start bot"

if (AskYN "Start Cli-Claw with PM2?" "Y") {
    Set-Location $installDir
    pm2 delete cliclaw 2>$null
    pm2 start ecosystem.config.js
    pm2 save

    Write-Host ""
    Write-Info "To enable auto-start on Windows login, run:"
    Write-Host "  npm install -g pm2-windows-startup" -ForegroundColor Yellow
    Write-Host "  pm2-startup install" -ForegroundColor Yellow

    if (AskYN "Install pm2-windows-startup now?" "Y") {
        npm install -g pm2-windows-startup
        pm2-startup install
        Write-Ok "Auto-start configured"
    }
    Write-Ok "Cli-Claw is running"
} else {
    Write-Host ""
    Write-Info "To start manually:  cd $installDir; npx tsx index.ts"
    Write-Info "To start with PM2:  cd $installDir; pm2 start ecosystem.config.js"
}

# ─── done ─────────────────────────────────────────────────────────────────────
Write-Host "`n" -NoNewline
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host " Cli-Claw installed successfully!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Location:   $installDir" -ForegroundColor White
Write-Host "  Config:     $installDir\.env" -ForegroundColor White
Write-Host "  PM2 status: pm2 status" -ForegroundColor White
Write-Host "  Logs:       pm2 logs cliclaw" -ForegroundColor White
Write-Host "  Restart:    pm2 restart cliclaw" -ForegroundColor White
Write-Host ""
Write-Host "  Open Telegram and send /start to your bot!" -ForegroundColor Cyan
Write-Host ""
if ($forumId -eq "") {
    Write-Warn "Don't forget to set FORUM_GROUP_ID in .env and restart."
    Write-Host ""
}
