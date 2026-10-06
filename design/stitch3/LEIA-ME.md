# Material do Stitch — 3a rodada (06/10/2026)

Recebido por chat (nao em zip): PRD, tela de Inicio e Brand Book.

- `BRAND-BOOK.md` — **referencia canonica de design** a partir desta data. Diferente das rodadas
  anteriores, usa as cores do projeto (#06070C / #0F7BFF) e proibe explicitamente o brilho azul
  difuso, que e a mesma decisao ja tomada aqui em 28/09.
- `PRD.md` — documento de requisitos. **Tratar como aspiracional, nao como estado atual**: descreve
  varios recursos que o app nao tem (CloudDVR, pareamento por QR Code, gestos de brilho, pular
  abertura, WebCodecs/HEVC, criptografia simetrica das credenciais, latencia <1,5s). Nao usar como
  fonte de verdade sobre o que esta implementado.
- `inicio.html` — tela de Inicio (a que faltava).

## Conflito conhecido entre os dois documentos do Stitch
A escala tipografica do BRAND-BOOK difere da do DESIGN.md da 1a rodada:

| Nivel | DESIGN.md (1a rodada) | BRAND-BOOK (canonico) |
|---|---|---|
| Display hero | 56px | 48px |
| Titulo de secao | 40px | 32px |
| Titulo de fileira | 24px | 20px |
| Corpo | 15px | 14px |

Vale o BRAND-BOOK, por ser declarado canonico e por estar mais proximo do tamanho real usado numa
interface de streaming.
