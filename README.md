# PedreiraFlix

Interface estilo streaming (React + Vite + Tailwind) para servidores IPTV com API Xtream Codes: canais ao vivo com EPG, filmes, séries, continuar assistindo, favoritos, busca e download.

O app não inclui nenhum conteúdo nem servidor: você entra com o endereço, usuário e senha do **seu próprio** provedor.

## Rodar

```bash
npm install
npm run dev
```

Abre em http://localhost:5173. O `npm run dev` sobe o Vite e um proxy local (`server/index.js`, porta 8787).

## Por que precisa do proxy

Painéis Xtream quase nunca liberam CORS e costumam servir em `http://`, então o navegador bloqueia a chamada direta. O proxy repassa a API e o streaming (HLS/MP4) e bloqueia destinos de rede privada (SSRF).

Por isso o app **não funciona só como site estático** (GitHub Pages, etc.): sem o proxy, o login falha.

## Segurança

- Credenciais ficam só no `localStorage` do seu navegador.
- Não exponha o proxy na internet sem autenticação: ele repassa requisições para qualquer host público.

## Publicar de graça (Cloudflare Workers)

Um único Worker serve o site (`dist/`) e o proxy (`worker/index.js`) no mesmo domínio. O proxy só aceita hosts de uma lista secreta, então não vira proxy aberto.

```bash
npx wrangler login
npm run deploy
npx wrangler secret put ALLOWED_HOSTS   # ex.: painel.exemplo.com,cdn.exemplo.com
```

Inclua na lista o host do painel e, se as playlists HLS apontarem segmentos para outros hosts, esses também (redirecionamentos HTTP do painel não precisam estar na lista). Para testar local: crie `.dev.vars` com `ALLOWED_HOSTS=...` e rode `npx wrangler dev`.

Limites do plano gratuito: 100 mil requisições/dia (HLS ao vivo gasta muitas). Servir vídeo por proxy pode ferir os termos da Cloudflare; use por sua conta e risco.
