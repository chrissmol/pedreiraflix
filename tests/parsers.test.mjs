import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseM3u, parseM3uEpgUrl } from '../src/lib/m3u.ts'
import { matchesQuery, normalizeText } from '../src/lib/search.ts'
import { parseXmltvTime } from '../src/lib/xmltv.ts'

const PLAYLIST = `#EXTM3U x-tvg-url="https://epg.exemplo/guia.xml.gz,https://outro/guia.xml"
#EXTINF:-1 tvg-id="globo.br" tvg-logo="https://l/globo.png" group-title="Canais | Abertos",Globo SP
http://p/live/1.ts
#EXTINF:-1 group-title="Filmes | Ação",Rock, Paper (2020)
#EXTVLCOPT:http-user-agent=VLC

http://p/movie/2.mp4
#EXTINF:-1 group-title="Séries | Drama",Breaking Bad - S02E05
http://p/series/3.mp4
#EXTINF:-1 group-title="Séries Novas",Dark
http://p/series/4.mp4
#EXTINF:-1,Sem URL no fim`

test('m3u: classifica canal, filme e serie e pula linha quebrada', () => {
  const [canal, filme, ep, serie, ...resto] = parseM3u(PLAYLIST)
  assert.equal(resto.length, 0)
  assert.deepEqual(
    { name: canal.name, kind: canal.kind, tvgId: canal.tvgId, logo: canal.logo, group: canal.group },
    { name: 'Globo SP', kind: 'live', tvgId: 'globo.br', logo: 'https://l/globo.png', group: 'Canais | Abertos' },
  )
  // virgula no titulo e linhas #EXT/brancas entre o EXTINF e a URL
  assert.equal(filme.name, 'Rock, Paper (2020)')
  assert.equal(filme.kind, 'movie')
  assert.equal(filme.url, 'http://p/movie/2.mp4')
  assert.deepEqual([ep.kind, ep.season, ep.episode, ep.seriesName], ['series', 2, 5, 'Breaking Bad'])
  assert.deepEqual([serie.kind, serie.seriesName], ['series', 'Dark'])
})

test('m3u: grupo vazio vira "Sem categoria" e ids seguem a ordem', () => {
  const e = parseM3u('#EXTINF:-1,A\nhttp://a\n#EXTINF:-1,B\nhttp://b')
  assert.deepEqual(e.map((x) => [x.id, x.group]), [[1, 'Sem categoria'], [2, 'Sem categoria']])
  assert.deepEqual(parseM3u('lixo\nsem extinf'), [])
})

test('m3u: endereco do guia no cabecalho', () => {
  assert.equal(parseM3uEpgUrl(PLAYLIST), 'https://epg.exemplo/guia.xml.gz')
  assert.equal(parseM3uEpgUrl('#EXTM3U url-tvg="ftp://x"'), null)
  assert.equal(parseM3uEpgUrl('#EXTM3U\n#EXTINF:-1,A'), null)
})

test('xmltv: horario com e sem fuso', () => {
  assert.equal(parseXmltvTime('20261015203000 -0300').toISOString(), '2026-10-15T23:30:00.000Z')
  assert.equal(parseXmltvTime('202610152030 +0000').toISOString(), '2026-10-15T20:30:00.000Z')
  const local = parseXmltvTime('20261015203000')
  assert.deepEqual([local.getHours(), local.getMinutes()], [20, 30])
  assert.equal(parseXmltvTime('ontem'), null)
})

test('busca: ignora acento, caixa e ordem das palavras', () => {
  assert.equal(normalizeText('Ação PÂNICO'), 'acao panico')
  assert.ok(matchesQuery('Futebol Americano ao vivo', 'americano futebol'))
  assert.ok(matchesQuery('Coração Valente', 'coracao'))
  assert.ok(!matchesQuery('Coração Valente', 'coracao bravo'))
  assert.ok(matchesQuery('qualquer', '   '))
})
