---
name: estressar-web
description: Estressa o site do PedreiraFlix no navegador, como computador, celular e TV, e procura problemas. Pega erros de JavaScript e HTTP, mas também interface feia, cortada, desalinhada ou fora do estilo do projeto. Use quando pedirem para "estressar o site", "testar a web", "procurar problemas visuais" ou antes de liberar uma mudança grande de interface.
---

# Estressar o site

É irmã do `estressar-apk`, só que roda no navegador e em qualquer máquina, sem emulador. Tem duas partes: um
roteiro automático e uma revisão visual feita por você. A revisão visual é obrigatória: o Christian quer que o
agente ache também **coisas feias, que não combinam, layouts e interfaces bugadas ou fora do estilo do projeto**.

## 1. Rodar o roteiro

```bash
npm ci                                              # se node_modules não existir
npm run estressar-web                               # computador, celular e TV
npm run estressar-web -- --aparelho celular         # um aparelho só (computador, celular ou tv)
npm run estressar-web -- --cliques 500              # macaco mais longo (padrão 150)
```

O roteiro:
- sobe o painel falso (`e2e/mock-xtream.mjs`), o proxy e o Vite locais, ou reaproveita o que já estiver nas
  portas 8790, 8787 e 5173;
- abre cada tela (login, início, canais, guia, filmes, filme, séries, série, busca, downloads, perfis, diagnóstico
  e player), mais os estados vazios e de erro (busca sem resultado, filme que não existe, provedor fora do ar), em
  cada aparelho, tira uma captura e roda as checagens de `scripts/auditar-layout.mjs` (as mesmas do APK): algo
  saindo da tela, rolagem para o lado, texto cortado sem reticências, botão coberto por outro elemento, título por
  baixo do cabeçalho, enfeite do provedor e, no celular, alvo pequeno para o dedo;
- tira o site da internet e devolve;
- roda um macaco: cliques aleatórios no computador e no celular, e setas, OK e voltar na TV;
- registra erro de JavaScript, `console.error` e resposta HTTP 4xx/5xx.

Saída: `test-results/estresse-web/relatorio.md` e as capturas `<aparelho>-<tela>.png`. Ruído só de
desenvolvimento já é ignorado: o `/api/tmdb` só existe no Worker, e o WebSocket do Vite também é descartado.

Na sessão na nuvem o Chromium pré-instalado é de outra versão, e o vídeo pode não tocar nas capturas do player.
Isso não é bug do app.

## 2. Revisão visual (você)

Abra **cada captura** com a ferramenta de leitura de imagem e compare com o brand book canônico,
`design/stitch3/stitch_pedreiraflix_iptv_landing_page/pedreiraflix_brand_book_guia_de_estilo_oficial.md`
(fundo `#06070C`, azul `#0F7BFF`, sem brilho azul difuso, escala tipográfica do brand book). Compare a mesma tela
entre computador, celular e TV. Procure:

- **Cortado ou fora do lugar**: texto cortado sem reticências, elemento encostando na borda, coisa por cima de
  outra, espaço vazio grande, rolagem onde não deveria.
- **Não combina**: botões de formatos ou tamanhos diferentes lado a lado, cores fora da paleta, brilhos,
  espaçamentos desiguais, ícones de estilos diferentes, caixa alta onde o resto não usa.
- **Conteúdo cru do provedor**: nomes com `[L]`, `★`, `⚽`, CAIXA ALTA, anos repetidos.
- **Toque (celular)**: alvos pequenos, controles que só aparecem com o mouse por cima.
- **TV**: foco sem anel visível, letra pequena para ver do sofá, algo que não dá para alcançar com as setas.
- **Carregamento e erro**: tela vazia sem explicação, "Carregando..." solto, erro técnico na tela.

Os pôsteres do painel falso não têm imagem, então o título escrito em cinza no fundo é do painel falso, e não do
app. Contraste não é checado automaticamente, porque o fundo real depende de camadas e imagens e dava alarme
falso. Avalie o contraste na captura.

## 3. Corrigir

O Christian quer que o agente **corrija** os problemas de CSS, UI, UX e usabilidade que achar, e não só liste.
Para cada problema real:

1. Guarde a captura de antes (`cp test-results/estresse-web/<aparelho>-<tela>.png` para outra pasta).
2. Corrija com a menor mudança possível, nas classes Tailwind e nos componentes que já existem. Não mude a
   paleta, o brand book nem a estrutura da tela sem ele pedir.
3. Rode de novo só o aparelho afetado (`--aparelho`) e confira que o achado sumiu do relatório e que a captura de
   depois ficou certa nos três aparelhos.
4. Rode `npm run lint`, `npm run build` e os specs e2e da tela que mudou.
5. Abra um PR (uma branch por rodada), com cada correção descrita com antes e depois. Não faça merge.

Fica para o Christian decidir: mudanças de marca ou de cor (por exemplo, contraste do azul da marca), mudança de
layout de uma tela inteira, e qualquer coisa que ele já tenha decidido de outro jeito.

## 4. Reportar

Em português simples, separado em **Corrigido** (com antes e depois), **Precisa da sua decisão**, **Erros** e
**Ruído descartado**.
