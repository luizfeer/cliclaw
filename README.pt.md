# 🦀 Cli-Claw

> **Cli-Claw** é um bot Telegram que funciona como **ponte direta entre ferramentas CLI de IA e o seu celular**. Cada conversa vive em um tópico dedicado de Fórum — você digita de qualquer lugar, o CLI roda no servidor, a resposta volta. Sem API keys, sem cobrança por token, só o seu plano de assinatura.

```
/nova  →  abre um tópico no fórum  →  🟣 Claude ou 🟢 Codex
 └ cada tópico = uma sessão CLI com memória completa de conversa
```

📖 **[Read in English →](README.md)**

---

## Por que uma ponte de CLI?

A maioria dos bots Telegram de IA chama APIs HTTP. O Cli-Claw é diferente — ele aciona os binários CLI instalados no seu servidor:

| | Cli-Claw | Bots baseados em API |
|---|---|---|
| **Autenticação** | OAuth / login ChatGPT | API keys (pago por token) |
| **Custo** | Seu plano de assinatura | Cobrança por uso |
| **Tarefas agênticas** | ✅ Acesso completo às ferramentas | ❌ Limitado |
| **Controle de permissões** | ✅ Por sessão / sob demanda | N/A |
| **Adicionar novo CLI** | Instale e reinicie | N/A |

Por acionar processos CLI reais, o Cli-Claw pode fazer tudo o que você faria no terminal — instalar software, executar código, navegar em arquivos, rodar workflows agênticos longos.

---

## Agentes disponíveis

| Agente | Status | Requisito |
|---|---|---|
| 🟣 **Claude Code** | ✅ Disponível | Assinatura claude.ai |
| 🟢 **Codex** | ✅ Disponível | Conta OpenAI/ChatGPT |
| 🔜 **OpenCode** | Em breve | CLI open-source, sem assinatura |

Cada agente que você instala fica disponível imediatamente. O bot detecta quais CLIs estão no `PATH` ao iniciar e exibe um guia de configuração para o que ainda não está instalado.

---

## Comandos do bot

| Português | Inglês | Descrição |
|---|---|---|
| `/nova` | `/new` | Nova sessão Claude (cria tópico no fórum) |
| `/nova codex` | `/new codex` | Nova sessão Codex |
| `/sessoes` | `/sessions` | Listar todas as sessões |
| `/limpar` | `/clear` | Reiniciar sessão / tópico atual |
| `/status` | `/status` | Info da sessão ativa |
| `/id` | `/id` | Ver ID deste chat |
| `/ajuda` | `/help` | Exibir ajuda |

---

## Requisitos

- **Ubuntu 22+** (testado em Oracle Cloud ARM64)
- **Node.js 22+**
- **Claude Code CLI** autenticado via OAuth (`claude`) — *opcional, instale para ativar 🟣*
- **Codex CLI** autenticado via ChatGPT (`codex login`) — *opcional, instale para ativar 🟢*
- Um **grupo** Telegram com **Tópicos ativados**, bot adicionado como **admin**

---

## Instalação

### 1. Clonar e instalar

```bash
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw
npm install
```

### 2. Instalar Node.js 22 (se necessário)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g tsx pm2
```

### 3. Instalar os CLIs de IA

Instale pelo menos um. Pode adicionar mais depois — basta reiniciar o bot.

```bash
# Configurar npm global sem sudo
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc

# 🟣 Claude Code (requer assinatura claude.ai)
npm install -g @anthropic-ai/claude-code
claude   # abre link OAuth no navegador

# 🟢 Codex (requer conta OpenAI/ChatGPT)
npm install -g @openai/codex
codex login
```

> **Ainda não tem nenhum?** Tudo bem — instale o bot primeiro, depois envie `/start` no Telegram. O bot mostrará exatamente o que executar.

### 4. Configurar

```bash
cp .env.example .env
nano .env
```

```env
TELEGRAM_BOT_TOKEN=   # obtido no @BotFather → /newbot
FORUM_GROUP_ID=       # use /id dentro do grupo para obter
```

### 5. Escolher o modo de permissões

Adicione `PERMISSION_MODE` ao seu `.env`:

| Modo | Valor | Comportamento |
|---|---|---|
| **Full auto** *(recomendado)* | `auto` | Sempre pula prompts de permissão — modelos rodam livremente |
| **Por sessão** | `session` | Bot pergunta ao criar `/nova`: *"Permitir full auto nesta sessão?"* |
| **Sob demanda** | `ask` | Restrito por padrão; prefixe mensagens com `!` para liberar só aquele envio |

```env
PERMISSION_MODE=auto
```

### 6. Configurar o grupo Telegram

1. Crie um grupo no Telegram
2. **Editar grupo → Tópicos → Ativar**
3. Adicione o bot como **Admin** com permissão de *Gerenciar Tópicos*
4. Envie `/id` no grupo e copie o Chat ID
5. Cole como `FORUM_GROUP_ID` no `.env`

### 7. Iniciar

```bash
# Teste rápido
npx tsx index.ts

# Produção — reinicia automaticamente em crash e reboot
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

---

## Como funciona

```
Mensagem no tópico do fórum
       ↓
Identifica sessão pelo thread_id
       ↓
Lock da sessão (impede processos concorrentes)
       ↓
Envia "⚙️ Processando..." + typing loop a cada 4s
       ↓
Spawn do CLI com base no PERMISSION_MODE:
  claude --resume <id> -p "msg" --output-format text
  codex exec resume <thread> --json "msg"
       ↓
Processo roda até terminar (sem timeout que mata o processo)
       ↓
Deleta "Processando..." → envia resposta formatada em HTML
```

Os IDs de sessão são salvos em `data/chat_<id>.json` — o contexto sobrevive a reinicializações.

---

## Publicar no npm *(planejado)*

O objetivo é tornar a instalação um único comando:

```bash
npm install -g cliclaw
cliclaw setup   # wizard interativo: token do bot, ID do grupo, modo de permissão
cliclaw start
```

Isso requer um wizard `cli.js` e um entry point compilado. Os CLIs (`claude`, `codex`) ainda precisariam ser autenticados manualmente — o npm pode empacotar o código do bot mas não sessões OAuth. O wizard guiaria por esse passo.

Contribuições são bem-vindas: **[github.com/luizfeer/cliclaw](https://github.com/luizfeer/cliclaw)**

---

## Estrutura do projeto

```
cliclaw/
├── index.ts                   # Ponto de entrada
├── ecosystem.config.js        # Configuração PM2 (usa tsx)
├── src/
│   ├── config.ts              # Carrega .env + detecta CLIs disponíveis
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
├── .env                       # Segredos (ignorado pelo git)
└── .env.example               # Template de configuração
```

---

## Deploy em outra VPS

```bash
git clone https://github.com/luizfeer/cliclaw.git
cd cliclaw && npm install
npm install -g tsx pm2 @anthropic-ai/claude-code @openai/codex
claude && codex login
cp .env.example .env && nano .env
pm2 start ecosystem.config.js && pm2 save
```

---

## Contribuindo

Cli-Claw é um projeto aberto para a comunidade. PRs são bem-vindos — especialmente:
- Novos adaptadores de agentes CLI (OpenCode, Gemini CLI, etc.)
- Wizard `cliclaw setup` para distribuição via npm
- Melhorias de i18n
- UX de permissões mais refinada

---

## Licença

MIT
