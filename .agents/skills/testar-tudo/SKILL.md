---
name: testar-tudo
description: Roda todos os testes do PedreiraFlix (lint, build, unitários, proxy, worker e os e2e Playwright) e entrega um relatório por pilar do app, dizendo se cada falha parece do app, do navegador, do Worker ou do provedor. Use quando pedirem para "testar tudo", "rodar todos os testes", "testar o pilar X" ou antes de liberar uma versão.
---

# Testar tudo

O roteiro faz o trabalho mecânico; você lê o resultado e explica as falhas.

## 1. Rodar

```bash
npm ci                                   # se node_modules não existir
npm run testar-tudo                      # tudo: lint, build, test:proxy, test:worker e todos os e2e
npm run testar-tudo -- --pilar player    # só os e2e de um pilar (sem lint/build)
npm run testar-tudo -- --sem-e2e         # só as checagens rápidas
```

Pilares: `player`, `ao-vivo`, `catalogo`, `conta`, `downloads`, `pwa`, `proxy`, `telas`. A lista de specs de
cada um fica em `scripts/testar-tudo.mjs`; o roteiro falha se um spec novo em `e2e/` não estiver em nenhum.

O Playwright sobe sozinho o painel falso (8790), o proxy (8787), o Vite (5173) e um build do PWA (4173).
Se uma dessas portas já estiver ocupada por outra coisa (por exemplo a pré-visualização do app Claude na 8787),
desligue antes. Para o pilar `pwa` depois de mudar código, mate o que estiver na 4173 para ele refazer o build.

Saída: `test-results/testar-tudo/relatorio.md` (tabela por pilar e lista de falhas) e, para cada falha, o
trace em `test-results/<teste>/trace.zip`.

## 2. Ler as falhas

Para cada teste que falhou, abra o `error-context.md` da pasta dele em `test-results/` e o trecho do spec.
Classifique a causa, sem assumir que é sempre código:

- **App**: asserção de tela/comportamento falhou com os servidores de pé.
- **Navegador/ambiente**: vídeo não anda (`currentTime` parado) em máquina sem aceleração ou com Chromium
  diferente do que o Playwright espera; o CI já repete esses testes 2 vezes. Rode o teste sozinho de novo antes
  de culpar o app.
- **Worker/proxy**: falhou `npm run test:proxy`, ou o e2e mostra 4xx/5xx vindo de `/api`.
- **Provedor**: não se aplica aqui (os testes usam o painel falso); se aparecer, o teste está vazando para fora.

Se uma falha some quando o teste roda sozinho, diga que é instável e qual teste, em vez de chamar de flake e
seguir.

## 3. Reportar

Em português simples: a tabela do relatório, depois cada falha com pilar, causa provável e a correção
proposta. Não corrija sem o Christian pedir.
