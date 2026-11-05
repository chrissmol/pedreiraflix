# Desenvolvimento

Guia para quem mexe no código: como rodar, testar e publicar. As regras de trabalho (branches, PRs, merge, validação por plataforma) estão em [AGENTS.md](../AGENTS.md).

Produção: https://pedreiraflix.chrisouzamol.workers.dev

## Plataformas

Um só código (React + Vite + Tailwind) roda em todas elas. Toda mudança precisa funcionar nas quatro.

| Plataforma | Como funciona | Onde está |
|---|---|---|
| Site (celular e computador) | PWA instalável, servida pelo Worker da Cloudflare | `src/`, `worker/` |
| Android (celular e Fire Stick) | Capacitor abrindo o site publicado. Um APK novo só é preciso quando a parte nativa muda | `android/`, `capacitor.config.ts` |
| TV | O mesmo site, navegado por setas e OK (`isTv` em `src/lib/device.ts`) | `src/` |
| Windows | Tauri abrindo o site publicado. O instalador sai pelo workflow **App Windows** | `src-tauri/` |

## Rodar local

Precisa do Node 22.

```bash
npm install
npm run dev
```

Abre em http://localhost:5173. O `npm run dev` sobe o Vite e um proxy local (`server/index.js`, porta 8787).

Sem um provedor de verdade, `npm run mock` sobe um painel Xtream falso, o mesmo que os testes usam.

### Por que precisa do proxy

Painéis Xtream quase nunca liberam CORS e costumam servir em `http://`, então o navegador bloqueia a chamada direta. O proxy repassa a API e o vídeo (HLS/MP4) e bloqueia destinos de rede privada (SSRF). Por isso o app **não funciona como site estático** (GitHub Pages etc.): sem o proxy, o login falha.

## Testes

```bash
npm run lint          # oxlint
npm run build         # TypeScript + build do Vite
npm run test:proxy    # unitários do Worker e dos parsers
npm run test:e2e      # Playwright contra o painel falso
npm run testar-tudo   # tudo acima de uma vez
```

O CI (`.github/workflows/ci.yml`) roda lint, build, `test:proxy` e e2e em todo PR e em todo push na `main`.

## Deploy

O deploy é automático: quando o CI passa na `main`, o workflow **Deploy** publica o Worker e roda `scripts/checar-producao.mjs` contra o site no ar. Ele usa o secret `CLOUDFLARE_API_TOKEN` do GitHub. Para publicar na mão: `npx wrangler login` e `npm run deploy`.

Um único Worker (`worker/index.js`, configuração em `wrangler.jsonc`) serve o site e as rotas `/api/*`:

| Rota | Para que serve | Usa |
|---|---|---|
| `/api/xtream`, `/api/stream` | proxy da API e do vídeo do provedor | — |
| `/api/session` | cifra usuário e senha nas URLs de vídeo | secret `STREAM_KEY` |
| `/api/tmdb` | sinopse, elenco, imagens e nota do IMDb | secrets `TMDB_TOKEN` e `OMDB_KEY` |
| `/api/sugestoes` | busca por frase e "Parecidos com este" | Workers AI (`AI`) |
| `/api/sync` | favoritos, times e progresso iguais em todos os aparelhos da conta | D1 `SYNC` |
| `/api/feedback` | mensagens da tela Suporte | KV `FEEDBACK` |
| `/api/moltv/*` | times favoritos e jogos | Worker `mol-tv-api` (`MOLTV`) |
| `/api/grupo` | código do grupo: sem ele o proxy recusa o aparelho | secret `GROUP_CODE` |
| `/api/log-error` | erros do app que os usuários encontram | log do Worker |

O KV e o D1 são criados pelo próprio `wrangler deploy` na primeira vez. Todos os secrets são opcionais: sem eles, o recurso correspondente some e o resto do app continua funcionando. Para criá-los:

```powershell
.\scripts\set-stream-key.ps1     # gera e grava STREAM_KEY
.\scripts\set-tmdb-token.ps1     # confere e grava TMDB_TOKEN
npx wrangler secret put OMDB_KEY
npx wrangler secret put GROUP_CODE   # código que os amigos digitam uma vez; trocar desloga todo mundo
# ou: Actions > "Codigo do grupo" > Run workflow (gera um código e grava; sai cifrado no log, o repo é público)
```

Para rodar o Worker local, crie `.dev.vars` com os mesmos nomes e rode `npx wrangler dev`.

## Segurança

- Credenciais e dados dos perfis ficam no aparelho. A sincronização guarda só favoritos, times, progresso e vistos, sob uma chave que é o SHA-256 de servidor, usuário e senha. A senha nunca vai para o banco.
- O proxy aceita qualquer host público e recusa redes privadas. Com o secret `GROUP_CODE`, ele só atende aparelhos que já digitaram o código do grupo (cookie com o hash do código); sem o secret, qualquer pessoa que souber o endereço consegue usá-lo. Vídeo com sessão cifrada (`/api/stream?s=`) passa sem cookie, porque Chromecast e AirPlay não mandam cookie e a sessão só sai do `/api/session`, que já exige o código.
- Plano grátis da Cloudflare: 100 mil requisições por dia (TV ao vivo gasta muitas). Servir vídeo por proxy pode ferir os termos da Cloudflare, então use por sua conta e risco.
- Como avisar de uma falha: veja [SECURITY.md](../.github/SECURITY.md).


## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `src/` | App React (páginas, componentes, hooks, store) |
| `worker/` | Worker da Cloudflare: site e rotas `/api/*` |
| `server/` | Proxy local usado no `npm run dev` |
| `tests/` | Testes unitários (`tests/worker/` cobre o Worker) |
| `e2e/` | Testes Playwright e o painel Xtream falso |
| `scripts/` | Automação: testar tudo, checar produção, estresse, secrets |
| `android/`, `src-tauri/`, `tizen/` | Cascas nativas: Android/Fire Stick, Windows, TV Samsung |
| `public/` | Ícones, manifesto, service worker, página Sobre |
| `docs/` | Documentação e material de design |
| `tools/` | Ferramentas internas (`claude-worker`) |
| `.github/` | Workflows, templates e política de segurança |
