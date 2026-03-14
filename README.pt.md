# 🦀 Agora

> **Agora** (do grego *ἀγορά* — o fórum público) é um bot Telegram que roteia conversas para agentes CLI de IA (Claude Code + OpenAI Codex) como tópicos dedicados em grupos de fórum. Cada sessão vive em seu próprio tópico, mantendo cada conversa isolada e persistente.

```
/nova  →  cria um tópico no fórum  →  🟣 Claude ou 🟢 Codex
```

---

## Funcionalidades

- **Forum-first** — cada sessão de IA é um tópico de fórum no Telegram
- **Sessões persistentes** — histórico de conversa sobrevive a reinicializações do bot (armazenamento JSON)
- **Sem API keys** — usa o login OAuth do Claude Code e o login ChatGPT do Codex
- **Modo full auto** — `--dangerously-skip-permissions` / `--dangerously-bypass-approvals-and-sandbox`
- **Processamento assíncrono** — indicador de digitação enquanto o CLI roda; resposta enviada quando pronta
- **Lock por sessão** — impede processos duplicados na mesma sessão
- **Formatação nativa do Telegram** — Markdown convertido para HTML do Telegram automaticamente

---

## Requisitos

- **Ubuntu 22+** (testado em Oracle Cloud ARM64)
- **Node.js 22+** e **Bun 1.3+**
- **Claude Code CLI** autenticado via OAuth (`claude`)
- **Codex CLI** autenticado via ChatGPT (`codex login`)
- Um **grupo** Telegram com **Tópicos ativados**, bot adicionado como **admin**

---

## Instalação

### 1. Clonar e instalar dependências

```bash
git clone https://github.com/seu-usuario/agora.git
cd agora
bun install
```

### 2. Instalar os CLIs

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Bun
sudo apt-get install -y unzip
curl -fsSL https://bun.sh/install | bash

# Claude Code + Codex + PM2 (sem sudo)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

npm install -g @anthropic-ai/claude-code @openai/codex pm2
```

### 3. Autenticar os CLIs

```bash
# Claude Code — abre link OAuth (requer assinatura claude.ai)
export PATH="$HOME/.npm-global/bin:$PATH"
claude

# Codex — login via ChatGPT
codex login
```

### 4. Configurar o ambiente

```bash
cp .env.example .env
nano .env
```

```env
TELEGRAM_BOT_TOKEN=   # obter no @BotFather → /newbot
FORUM_GROUP_ID=       # use /id dentro do grupo para obter
```

### 5. Configurar o grupo Telegram

1. Crie um grupo no Telegram
2. **Editar grupo → Tópicos → Ativar**
3. Adicione o bot como **Admin** com permissão de *Gerenciar Tópicos*
4. Envie `/id` no grupo — copie o `Chat ID`
5. Cole como `FORUM_GROUP_ID` no `.env`

### 6. Iniciar

```bash
# Uma vez (teste)
bun run index.ts

# Produção com PM2 (reinicia automaticamente, sobrevive ao reboot)
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # siga o comando impresso
```

---

## Comandos do Bot

| Comando | Descrição |
|---|---|
| `/nova` | Nova sessão Claude (cria tópico no fórum) |
| `/nova codex` | Nova sessão Codex (cria tópico no fórum) |
| `/sessoes` | Listar todas as sessões |
| `/limpar` | Limpar histórico da sessão atual |
| `/status` | Ver info da sessão ativa |
| `/id` | Ver ID do chat atual |

---

## Estrutura do Projeto

```
agora/
├── index.ts                   # Ponto de entrada
├── ecosystem.config.js        # Configuração PM2
├── src/
│   ├── config.ts              # Carrega variáveis do .env
│   ├── storage.ts             # Persistência de sessões em JSON
│   ├── agents/
│   │   ├── claude.ts          # Wrapper do CLI Claude Code
│   │   └── codex.ts           # Wrapper do CLI Codex
│   ├── handlers/
│   │   ├── commands.ts        # /nova /sessoes /limpar etc.
│   │   └── messages.ts        # Roteamento por thread_id, typing loop, lock
│   └── utils/
│       └── markdown.ts        # Conversor Markdown → HTML do Telegram
├── data/                      # Arquivos JSON de sessão (ignorado pelo git)
├── logs/                      # Logs do PM2 (ignorado pelo git)
├── .env                       # Segredos (ignorado pelo git)
└── .env.example               # Template de configuração
```

---

## Como Funciona

```
Mensagem do usuário no tópico do fórum
        ↓
messages.ts: identifica sessão pelo thread_id
        ↓
Lock da sessão (impede processos concorrentes)
        ↓
Envia "⚙️ Processando..." + inicia typing loop (a cada 4s)
        ↓
Spawn: claude --resume <id> -p "msg" --output-format text
   ou: codex exec resume <thread_id> --json "msg"
        ↓
Processo roda até terminar (sem timeout que mata o processo)
        ↓
Deleta "Processando..." → envia resposta formatada
```

Os IDs de sessão (`claudeSessionId`, `codexThreadId`) são persistidos em `data/chat_<id>.json` para que o contexto da conversa sobreviva a reinicializações do bot.

---

## Implantando em Outra VPS

```bash
git clone https://github.com/seu-usuario/agora.git
cd agora && bun install
npm install -g @anthropic-ai/claude-code @openai/codex pm2
claude          # autenticar Claude
codex login     # autenticar Codex
cp .env.example .env && nano .env
pm2 start ecosystem.config.js && pm2 save
```

---

## Licença

MIT
