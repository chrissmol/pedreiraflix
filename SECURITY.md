# Segurança

## Como avisar de uma falha

Não abra issue pública. Use o [aviso privado de vulnerabilidade do GitHub](https://github.com/chrissmol/pedreiraflix/security/advisories/new) ou fale direto com o mantenedor (@chrissmol).

Diga o que encontrou, como reproduzir e o que dá para fazer com a falha.

## O que conta

- O Worker (`worker/`): o proxy, as rotas `/api/*`, os headers de segurança e o uso de KV, D1 e secrets.
- O app (`src/`): credenciais, PIN dos perfis, controle dos pais e dados guardados no aparelho.
- Os apps Android (`android/`) e Windows (`src-tauri/`).

Problemas do provedor IPTV de cada usuário estão fora do escopo.

## Versões

Só a versão publicada (a `main`) recebe correção.
