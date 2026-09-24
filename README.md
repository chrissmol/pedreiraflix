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
