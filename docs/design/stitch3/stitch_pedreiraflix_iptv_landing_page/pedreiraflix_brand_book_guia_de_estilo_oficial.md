# Brand Book & Guia de Estilo Oficial — PedreiraFlix

**Versão:** 1.0.0  
**Design System Oficial:** Cinematic Obsidian  
**Status:** Referência Canônica de Design & Engenharia de Front-end  

---

## 1. Princípios Visuais & Identidade
O PedreiraFlix combina a sobriedade dos melhores streamings globais (Netflix, Apple TV+, HBO Max) com a robustez e privacidade do modelo BYOC (*Bring Your Own Content*).
- **Sem Brilhos Exagerados (No Neon Glow):** Proibido o uso de `box-shadow` azul difuso excessivo ou néon espalhado sobre cards. O azul é um acento pontual de ação e foco, não um gradiente decorativo.
- **Contraste Orgânico:** Hierarquia construída através de camadas de superfícies translúcidas e opacas, e não por linhas divisórias pesadas.
- **Foco no Conteúdo:** A mídia (pôsteres, backdrops, transmissões) é a protagonista visual; a interface serve de moldura discreta e funcional.

---

## 2. Paleta de Cores e Superfícies

### 2.1 Cores Base & Fundo
- **Canvas / Background Principal:** `#06070C` (Preto Obsidian Profundo)  
  *Uso obrigatório em 100% dos fundos de página e do body.*
- **Superfície Nível 0 (Lowest):** `#0D0E13` (Containers de baixo relevo, inputs inativos)
- **Superfície Nível 1 (Low / Card Base):** `#121319` (Cards de conteúdo, sidebars, modais de primeiro nível)
- **Superfície Nível 2 (Medium / Hover):** `#1A1B21` (Estados de foco em lista, cartões destacados)
- **Superfície Translúcida (Glassmorphism):** `rgba(18, 19, 25, 0.75)` com `backdrop-filter: blur(16px)` (Barras de navegação persistentes, headers flutuantes, bottom sheets)

### 2.2 Cores de Acento & Destaque
- **Accent Primário (Elétrico):** `#0F7BFF` (Botões de ação primária, barras de progresso, toggles ativos, badges de seleção)
- **Accent Hover / Active:** `#0063D6` (Estado hover/pressionado de botões primários)
- **Accent Sutil (Badge / Soft Fill):** `rgba(15, 123, 255, 0.12)` (Pílulas de gênero selecionadas, tags ativas)

### 2.3 Status e Telemetria
- **Ao Vivo / Gravação:** `#FF3B30` (Badges 'AO VIVO', gravação CloudDVR ativa)
- **Sucesso / Download Concluído:** `#34C759` (Ícone de visto, download completo)
- **Classificação / Nota IMDb:** `#FFB800` (Estrelas de avaliação e badges de nota)

### 2.4 Tipografia e Tons de Texto
- **Texto Principal (High Emphasis):** `#FFFFFF` (Títulos, nomes de filmes, botões primários)
- **Texto Secundário (Medium Emphasis):** `#A1A1AA` (Sinopses, metadados, gênero, duração)
- **Texto Terciário / Muted:** `#71717A` (Tags técnicas, placeholders, rodapés secundários)
- **Bordas Sutis:** `rgba(255, 255, 255, 0.08)` (Contornos de cards, divisores finos)

---

## 3. Escala Tipográfica (Inter / Plus Jakarta Sans)

| Nível | Tamanho | Peso | Line-Height | Uso Recomendado |
| :--- | :--- | :--- | :--- | :--- |
| **Display Hero** | `48px` / `3rem` | Bold (700) | `1.1` | Título do Hero principal no banner inicial |
| **Heading 1** | `32px` / `2rem` | Bold (700) | `1.2` | Título de seções de catálogo, nomes de filmes no detalhe |
| **Heading 2** | `20px` / `1.25rem` | SemiBold (600) | `1.3` | Títulos das fileiras (ex: *Continuar Assistindo*) |
| **Heading 3** | `16px` / `1rem` | Medium (500) | `1.4` | Títulos de episódios, nomes de canais na grade |
| **Body Standard** | `14px` / `0.875rem` | Regular (400) | `1.5` | Sinopses, descrições, metadados de catálogo |
| **Caption / Badge** | `12px` / `0.75rem` | Medium (500) | `1.4` | Badges técnicas (*4K HDR*, *Dolby Atmos*), timestamps |

---

## 4. Raios de Borda (Corner Radius) e Espaçamento

- **Botões e Pílulas de Ação:** `rounded-full` (`9999px`) para botões de filtro, chips e botões primários/secundários.
- **Cards de Mídia (Pôsteres e Miniaturas):** `rounded-xl` (`12px`) com `overflow: hidden`.
- **Modais, Drawers e Bottom Sheets:** `rounded-2xl` (`16px` ou `24px`).
- **Inputs de Formulário:** `rounded-lg` (`8px`) ou `rounded-xl` (`12px`).
- **Grid & Gutter:**
  - Desktop: Container máximo `1440px`, padding horizontal de `48px` ou `64px`, gap entre pôsteres de `16px` a `24px`.
  - Mobile: Padding horizontal de `16px`, gap entre pôsteres de `12px`.

---

## 5. Padrões de Componentes

### 5.1 Cartão de Mídia (Pôster)
- Proporção vertical padrão: `2:3` para Filmes e Séries.
- Proporção horizontal widescreen: `16:9` para TV Ao Vivo e Episódios VOD.
- **Efeito Hover no Desktop:** Translação suave (`scale: 1.04`), sombra discreta preta profunda `box-shadow: 0 12px 24px rgba(0,0,0,0.6)` e revelação de micro-ações (Play, Lista, Detalhes).

### 5.2 Barra de Progresso
- Fundo: `rgba(255, 255, 255, 0.16)`.
- Preenchimento ativo: `#0F7BFF` plano e sólido.

### 5.3 HUDs e Indicadores de Player Mobile
- Controles de volume e brilho: Barras verticais finas com ícones translúcidos nos cantos laterais superiores da tela (`rgba(18, 19, 25, 0.8)` com texto em `%`).
- Indicadores de busca (Seek): Badge centralizada em pílula preta fumê com ícone de `+10s` ou `-10s`.

---

## 6. Tom de Voz & Diretrizes de Redação
- **Direto e Tecnológico:** Mensagens claras sobre reprodução, codecs (HLS, CMAF, HEVC) e status de download.
- **Respeito à Privacidade BYOC:** O usuário é dono de seus dados. Frases como *"Suas credenciais nunca saem do seu dispositivo"* reforçam a confiança técnica.
- **Equilíbrio de Marca:** O nome bem-humorado "PedreiraFlix" deve ser ancorado por uma experiência de uso extremamente rápida, séria e profissional.
