---
name: estressar-apk
description: Estressa o app Android do PedreiraFlix num emulador e procura problemas — travamentos, ANRs e erros de JavaScript, mas também interface feia, cortada, desalinhada ou fora do estilo do projeto. Use quando pedirem para "estressar o APK", "testar o app Android", "procurar problemas no app" ou antes de entregar um APK novo.
---

# Estressar o APK

Duas partes: um roteiro automático e uma revisão visual feita por você. A revisão visual é obrigatória —
o Christian quer que o agente ache também **coisas feias, que não combinam, layouts e interfaces bugadas
ou fora do estilo do projeto**, não só erros.

## 1. Rodar o roteiro

Pré-requisitos (Mac do Christian): JDK em `~/.local/jdk`, Android SDK e emulador (AVD `pf36`) em
`~/.local/android`, Node em `~/.local/node/bin`. **Desligue a pré-visualização do app Claude antes**: ela
ocupa a porta 8787 com um proxy que bloqueia o painel falso.

```bash
PATH="$HOME/.local/node/bin:$PATH" node scripts/estressar-apk.mjs            # gera e instala o APK de teste
PATH="$HOME/.local/node/bin:$PATH" node scripts/estressar-apk.mjs --sem-build --eventos 3000
```

O roteiro:
- sobe o painel falso (`e2e/mock-xtream.mjs`), o proxy e o site locais;
- gera o **APK de teste** (`com.pedreiraflix.app.teste`, instala ao lado do app de verdade) apontando para
  o site local, e devolve o projeto à configuração de produção;
- entra com a conta de teste do e2e e passeia: início, canais, filmes, filme, série, busca, player;
- em cada tela, **checagens automáticas de layout**: algo saindo da tela, rolagem para o lado, barra de
  rolagem visível no toque, alvo menor que 32 px para o dedo, título por baixo do cabeçalho, enfeite do
  provedor aparecendo (`[L]`, `★ GLOBO`, ano repetido);
- macaco de toques aleatórios logado, girar a tela, segundo plano, sem internet, botão voltar, memória baixa;
- procura travamentos e ANRs no logcat e erros de JavaScript na página.

Saída: `test-results/estresse-apk/relatorio.md`, capturas `0*-*.png` e `logcat.txt`. Ruído só de
desenvolvimento já é ignorado (`/api/tmdb` não existe no dev; WebSocket do Vite; rede durante "sem internet").

**Antes de reportar um ANR, confirme que não foi o emulador**: se o `adb` também trava, reinicie o
emulador (`adb emu kill`, depois `emulator -avd pf36 -no-snapshot-load`) e rode de novo.

## 2. Revisão visual (você)

Abra **cada captura** com a ferramenta de leitura de imagem e compare com o brand book canônico,
`design/stitch3/stitch_pedreiraflix_iptv_landing_page/pedreiraflix_brand_book_guia_de_estilo_oficial.md`
(fundo `#06070C`, azul `#0F7BFF`, sem brilho azul difuso, escala tipográfica do brand book). Procure:

- **Cortado ou fora do lugar**: texto cortado no meio, elemento encostando na borda, coisa por cima de
  outra, espaço vazio grande, rolagem onde não deveria (login), barra branca do sistema.
- **Não combina**: botões de formatos ou tamanhos diferentes lado a lado, cores fora da paleta, brilhos,
  espaçamentos desiguais (ex.: a busca oval e o espaço desigual que o Christian achou em 08/10),
  ícones de estilos diferentes, caixa alta onde o resto não usa.
- **Conteúdo cru do provedor**: nomes com `[L]`, `★`, `⚽`, CAIXA ALTA, anos repetidos.
- **Toque**: alvos pequenos, controles só acessíveis por hover, coisa que exige precisão no dedo.
- **Carregamento e erro**: tela vazia sem explicação, "Carregando..." solto, erro técnico na tela.

## 3. Reportar

Em português simples, separado em **Erros e travamentos**, **Layout e visual** (com o nome da captura) e
**Ruído descartado**. Para cada item visual: o que está errado, por que destoa do projeto e a correção
proposta. Não corrija sem o Christian pedir; registre no Obsidian (nota do roadmap do PedreiraFlix).
