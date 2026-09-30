# PedreiraFlix - regras de trabalho para agentes

Este repositório segue o modelo operacional do Mol Sports: GitHub é a fila oficial, PR é a unidade de mudança, Codex revisa/coordena, Claude Code executa tarefas pequenas em branch própria, e o Obsidian registra decisões duráveis.

Separação central de papéis:

- Codex/ChatGPT **não deve virar o executor padrão de feature work**. Seu papel padrão é transformar a vontade do Christian em issues pequenas, prompts/instruções precisas para Claude Code, revisão de PR, checagem de CI/testes, decisão operacional e atualização do Obsidian.
- Claude Code é o executor preferencial para implementação: pega uma issue pronta, trabalha em branch própria, testa, abre PR e para.
- Christian decide prioridade, aprova escopo, autoriza merge e publicação.

## Antes de qualquer alteração

1. Comece sempre da `main` limpa e atualizada:
   ```powershell
   git switch main
   git pull --ff-only origin main
   git status --short
   ```
2. Se `git status --short` mostrar mudanças que você não fez, pare e peça orientação. Não reverta trabalho alheio.
3. Leia este arquivo, o `README.md`, o `package.json` e as notas relevantes do vault `Segundo Cerebro` antes de mudar comportamento.
4. Trabalhe em uma tarefa pequena por vez, ligada a uma issue do GitHub.

## Fluxo obrigatório

1. Issue clara com escopo, fora de escopo e validação.
2. Branch própria a partir da `main`, preferencialmente:
   ```text
   codex/<descricao-curta>
   ```
3. Mudanças mínimas para cumprir a issue.
4. Testes relevantes antes do PR.
5. Abrir PR e marcar como pronto para revisão.
6. Não fazer merge, não publicar/deployar e não fechar issue sem autorização explícita do Christian/Codex coordenador.

## Labels de fila

- `pedreira:claude-ready`: tarefa pronta para Claude Code executar.
- `pedreira:claude-running`: Claude Code está trabalhando.
- `pedreira:review-ready`: PR aberto, aguardando revisão.
- `pedreira:claude-failed`: falha segura, precisa intervenção.
- `pedreira:governance`: processo, automação, CI/CD e documentação operacional.

## Worker local do Claude Code

O worker local (`tools/claude-worker/worker.ts`) é a ponte que evita copiar e colar entre chats: Codex cria/especifica a issue, o worker chama Claude Code, Claude implementa em branch própria, abre PR e para.

Uso manual:

```powershell
npm run claude-worker -- --dry
npm run claude-worker -- --issue 123 --dry
npm run claude-worker
```

Instalação como tarefa agendada escondida no Windows:

```powershell
.\scripts\install-claude-worker-task.ps1
```

Regras do worker:

- sempre inicia o prompt enviado ao Claude Code com `/ponytail full`;
- pede uso mínimo de tokens e mudança mínima correta;
- só inicia na `main` limpa e sincronizada com `origin/main`;
- processa exatamente uma issue `pedreira:claude-ready` por vez;
- move labels para `pedreira:claude-running`, `pedreira:review-ready` ou `pedreira:claude-failed`;
- cria branch `codex/claude-<issue>-<slug>`;
- executa Claude Code com permissões limitadas;
- nunca faz merge;
- nunca faz deploy;
- grava logs locais em `.pedreira/claude-worker/`.

Validação do worker:

```powershell
npm run test:worker
```

## Validação padrão

Escolha o menor conjunto que prova a mudança, mas use estes comandos como base:

```powershell
npm run lint
npm run build
npm run test:e2e
```

Para mudanças pequenas, rode pelo menos `npm run lint` e `npm run build`, mais specs Playwright diretamente relacionadas. Para player, live TV, cache, CSP, PWA, safe area ou fluxo de login, adicione teste e2e ou uma verificação manual explícita no PR.

## Deploy e produção

- O deploy automático roda pelo GitHub Actions somente depois do CI verde em `main`.
- `npm run deploy` manual só deve ser usado quando o Christian pedir explicitamente.
- Correções dependentes de headers/Worker precisam de verificação em produção depois do deploy (por exemplo `curl -I` para CSP).

## Obsidian

Ao finalizar trabalho relevante:

1. Atualize o roadmap do PedreiraFlix no vault `Segundo Cerebro`.
2. Registre decisões, pendências, testes e commits/PRs.
3. Depois de alterar o vault, faça commit e push do vault conforme `INSTRUCOES.md` da raiz do vault.

## Segurança

- Nunca escreva segredos no Git, logs, issues ou PRs.
- Valide presença de secret por nome, nunca pelo valor.
- Não use `--dangerously-skip-permissions`.
- Preserve proteções existentes do proxy, CSP, rate limit, service worker e fluxo de autenticação.

## Estilo de mudança

- Preserve a UI atual salvo pedido explícito.
- Não remova header/navegação sem autorização explícita.
- Em mobile/iPhone/PWA, valide safe areas e comportamento touch com screenshots ou teste real sempre que possível.
- Para live TV/player, não assuma que o problema é só código: diferencie app, navegador, Worker e provedor.
