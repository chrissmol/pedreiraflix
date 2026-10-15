---
name: checar-producao
description: Confere o PedreiraFlix publicado (pagina, CSP e headers, PWA, cache dos assets, protecao do proxy e se os secrets STREAM_KEY e TMDB_TOKEN existem) sem login nem segredo. Use quando pedirem para "checar producao", "ver se o site esta no ar", "conferir o deploy" ou depois de um deploy.
---

# Checar produção

So leitura. Nao faz login, nao usa credencial de provedor e nao le valor de segredo.

## Rodar

```bash
npm run checar-producao                         # site de producao
npm run checar-producao -- http://localhost:8787  # outro endereco (ex.: wrangler dev)
```

O deploy (`.github/workflows/deploy.yml`) ja roda isso logo depois do `wrangler deploy`: se algo falhar o
workflow fica vermelho, mas o deploy nao e desfeito.

## O que cada falha quer dizer

- **pagina inicial / rota do app / assets**: o build publicado esta quebrado ou incompleto. Veja o ultimo
  deploy no Actions.
- **headers de seguranca**: a CSP ou outro header sumiu ou mudou em `worker/index.js` (`SECURITY_HEADERS`),
  ou o `run_worker_first` saiu do `wrangler.jsonc`.
- **PWA**: manifest, icone ou `sw.js` fora do ar; o app instalado para de atualizar.
- **proxy bloqueia endereco interno**: a protecao contra SSRF (`isAllowed`) parou de funcionar. Urgente.
- **STREAM_KEY / TMDB_TOKEN**: o secret nao existe no Worker. Configure com `scripts/set-stream-key.ps1` ou
  `scripts/set-tmdb-token.ps1`, nunca colando o valor em chat, issue ou log.

Se o problema for do provedor IPTV (canal fora, 403 de limite de telas), isto nao pega: use a pagina
Diagnostico do app.

## Reportar

Em portugues simples: o que falhou, o que significa e a correcao proposta. Nao faca deploy nem mude secret sem
o Christian pedir.
