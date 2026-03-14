# 🦀 Cli-Claw

> **Cli-Claw** é um bot Telegram que funciona como **ponte entre CLIs de IA e seu celular** — cada conversa vive em um tópico dedicado de Fórum, dando acesso direto ao Claude Code e OpenAI Codex de qualquer lugar, sem sair do Telegram.

A ideia é simples: ferramentas poderosas de IA em CLI rodam no servidor, mas interagir com elas exige um terminal. O Cli-Claw resolve isso expondo esses CLIs através de tópicos de fórum do Telegram — um tópico por sessão, contexto persistente, respostas assíncronas. Você digita pelo celular; o CLI roda na VPS; a resposta volta.

```
/nova  →  abre um tópico no fórum  →  🟣 Claude ou 🟢 Codex
 └ cada tópico = uma sessão CLI com memória completa de conversa
```

---

## Por que ponte de CLI?

A maioria dos bots Telegram de IA chama APIs HTTP. O Cli-Claw é diferente:

| Abordagem | Cli-Claw | Bots baseados em API |
|---|---|---|
| Autenticação | OAuth / login ChatGPT | API keys (pago por token) |
| Acesso ao modelo | Seu plano de assinatura | Cobrança por uso |
| Tarefas agênticas | Sim — ferramentas CLI completas | Limitado |
| Permissões | Configurável por sessão | N/A |
| Funciona offline | Sim (apenas VPS) | Não |

Por acionar os binários CLI diretamente, o Cli-Claw pode executar tarefas agênticas longas — instalar software, escrever e executar código, navegar em arquivos — da mesma forma que você faria no terminal.

---

## Funcionalidades

- **Forum-first** — cada sessão de IA é um tópico dedicado no Telegram
- **Sessões persistentes** — armazenamento JSON, contexto sobrevive a reinicializações
- **Sem API keys** — Claude Code OAuth + login ChatGPT do Codex
- **Permissões configuráveis** — modo automático, por sessão ou sob demanda
- **Processamento assíncrono** — indicador de digitação enquanto o CLI roda
- **Lock por sessão** — sem processos duplicados
- **Formatação nativa do Telegram** — Markdown convertido para HTML automaticamente

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
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw
bun install
```

### 2. Instalar os CLIs

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Bun
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

### 5. Escolher o modo de permissões para os modelos de IA

O Cli-Claw suporta três níveis de permissão. Defina `PERMISSION_MODE` no seu `.env`:

| Modo | Valor no .env | Comportamento |
|---|---|---|
| **Full auto** *(recomendado para VPS)* | `PERMISSION_MODE=auto` | Sempre passa `--dangerously-skip-permissions` — sem prompts, modelos rodam livremente |
| **Por sessão** | `PERMISSION_MODE=session` | Ao criar sessão com `/nova`, o bot pergunta: *"Permitir full auto nesta sessão?"* |
| **Sob demanda** | `PERMISSION_MODE=ask` | Padrão é restrito; prefixe qualquer mensagem com `!` para liberar full auto só naquele envio |

```env
# Exemplo: perguntar por sessão
PERMISSION_MODE=session
```

> Para a maioria das implantações em VPS que você controla, `auto` é a escolha prática. Use `session` ou `ask` se compartilha o bot com outros ou quer ser consultado antes de tarefas agênticas.

### 6. Configurar o grupo Telegram

1. Crie um grupo no Telegram
2. **Editar grupo → Tópicos → Ativar**
3. Adicione o bot como **Admin** com permissão de *Gerenciar Tópicos*
4. Envie `/id` no grupo — copie o `Chat ID`
5. Cole como `FORUM_GROUP_ID` no `.env`

### 7. Iniciar

```bash
# Uma vez (teste)
bun run index.ts

# Produção com PM2
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
cliclaw/
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
Usuário envia mensagem no tópico do fórum
        ↓
messages.ts: identifica sessão pelo thread_id
        ↓
Lock da sessão (impede processos concorrentes)
        ↓
Envia "⚙️ Processando..." + typing loop a cada 4s
        ↓
Spawn do CLI com flags de permissão baseadas no PERMISSION_MODE
  claude --resume <id> -p "msg" --output-format text [--dangerously-skip-permissions]
  codex exec resume <thread> --json "msg" [--dangerously-bypass-approvals-and-sandbox]
        ↓
Processo roda até terminar (sem timeout que mata o processo)
        ↓
Deleta "Processando..." → envia resposta formatada em HTML
```

Os IDs de sessão (`claudeSessionId`, `codexThreadId`) são salvos em `data/chat_<id>.json` para que o contexto sobreviva a reinicializações.

---

## Publicar no npm

O Cli-Claw pode ser distribuído como pacote npm, tornando a instalação um único comando.

**Como funciona:**

```bash
npm install -g cliclaw
cliclaw setup   # wizard interativo: token do bot, ID do grupo, modo de permissão
cliclaw start   # inicia via PM2
```

O pacote incluiria um entry point compilado (`bun build --compile`) ou um wrapper compatível com Node. O `package.json` precisa de um campo `bin`:

```json
{
  "name": "cliclaw",
  "bin": { "cliclaw": "./cli.js" },
  "files": ["dist/", "cli.js", "src/", "ecosystem.config.js", ".env.example"]
}
```

Depois é só publicar:

```bash
npm login
npm publish
```

> **Nota:** Os CLIs (`claude`, `codex`) ainda precisam ser autenticados manualmente após a instalação — o npm pode empacotar o código do bot mas não pode empacotar sessões OAuth. Um wizard `cliclaw setup` guiaria por esse processo. Planejado para versão futura.

---

## Implantando em Outra VPS

```bash
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw && bun install
npm install -g @anthropic-ai/claude-code @openai/codex pm2
claude          # autenticar Claude
codex login     # autenticar Codex
cp .env.example .env && nano .env
pm2 start ecosystem.config.js && pm2 save
```

---

## Licença

MIT
