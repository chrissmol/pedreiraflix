<p align="center">
  <img src="public/icon-512.png" alt="Logo do PedreiraFlix" width="120" />
</p>

<h1 align="center">PedreiraFlix</h1>

<p align="center">
  <a href="https://pedreiraflix.chrisouzamol.workers.dev/sobre/">Conheça o projeto na página Sobre</a>
</p>

Interface estilo streaming para servidores IPTV com API Xtream Codes (ou lista M3U), feita para um grupo de amigos assistirem no que tiverem em casa: celular, computador, TV e Fire Stick.

O PedreiraFlix **não inclui nenhum conteúdo nem servidor**. Quem entra usa o endereço, usuário e senha do **próprio** provedor.

## O que ele é

- **TV ao vivo** com guia de programação (EPG), mosaico de canais e número de canal pelo controle.
- **Filmes e séries** com sinopse, elenco, nota do IMDb, "continuar assistindo" e sugestões parecidas.
- **Busca por frase**, favoritos e times favoritos com os jogos do dia.
- **Perfis** com PIN e controle dos pais.
- **Downloads** para ver offline e sincronização entre aparelhos.
- **Assistir junto**, com a sala sincronizada entre pessoas.

## Plataformas

Um só código (React, Vite e Tailwind) roda em todas as plataformas:

| Plataforma | Formato |
|---|---|
| Celular e computador | Site instalável (PWA) |
| Android e Fire Stick | App Android (Capacitor) |
| TV | O mesmo site, navegado por setas e OK |
| Windows | App de desktop (Tauri) |
| TV Samsung | App Tizen |

Por trás, um Worker da Cloudflare serve o site e faz a ponte com o provedor.

## Documentação

- [Desenvolvimento](docs/DESENVOLVIMENTO.md): estrutura, execução local, testes e publicação.
- [Segurança](.github/SECURITY.md)
- [Regras de trabalho](AGENTS.md)

## Créditos

- Dados de filmes e séries: [TMDB](https://www.themoviedb.org/). Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
- Nota do IMDb: [OMDb API](https://www.omdbapi.com/).
- Elenco e miniaturas de episódios: [TVmaze](https://www.tvmaze.com/), sob licença [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Busca por frase: [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/).
- Fonte [Inter](https://rsms.me/inter/), sob a SIL Open Font License.
