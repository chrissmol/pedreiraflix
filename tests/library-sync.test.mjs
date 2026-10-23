import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyProfile, claimKeys, extractProfile, mergeProfile } from '../src/lib/librarySync.ts'

const empty = { favorites: [], favoritesAt: 0, teams: [], teamsAt: 0, progress: {}, removed: {}, watched: [] }
const fav = (id) => ({ kind: 'movie', id, name: `f${id}`, image: null })
const prog = (id, updatedAt) => ({ kind: 'movie', id, name: id, image: null, ext: 'mp4', positionSeconds: 10, durationSeconds: 100, updatedAt })
const now = Date.now()

test('primeira sincronizacao junta os favoritos dos dois aparelhos (nada se perde)', () => {
  const merged = mergeProfile({ ...empty, favorites: [fav(1)] }, { ...empty, favorites: [fav(2)], favoritesAt: now - 1000 })
  assert.deepEqual(merged.favorites.map((f) => f.id).sort(), [1, 2])
  assert.ok(merged.favoritesAt >= now)
})

test('depois disso a lista mais recente vence, inclusive tirando favorito', () => {
  const merged = mergeProfile({ ...empty, favorites: [fav(1)], favoritesAt: now - 5000 }, { ...empty, favorites: [], favoritesAt: now })
  assert.deepEqual(merged.favorites, [])
})

test('progresso: o mais novo vence e o removido em outro aparelho nao volta', () => {
  const local = { ...empty, progress: { 'movie-a': prog('a', now - 100), 'movie-b': prog('b', now - 500) } }
  const remote = { ...empty, progress: { 'movie-a': prog('a', now - 50) }, removed: { 'movie-b': now - 200 }, watched: ['movie-b'] }
  const merged = mergeProfile(local, remote, now)
  assert.equal(merged.progress['movie-a'].updatedAt, now - 50)
  assert.equal(merged.progress['movie-b'], undefined)
  assert.deepEqual(merged.watched, ['movie-b'])
})

test('reassistir depois de tirar volta para o continuar assistindo', () => {
  const merged = mergeProfile({ ...empty, progress: { 'movie-b': prog('b', now) } }, { ...empty, removed: { 'movie-b': now - 10 } }, now)
  assert.ok(merged.progress['movie-b'])
})

test('extrai e aplica so as chaves do perfil, sem mexer no outro', () => {
  const state = {
    favorites: { p1: [fav(1)], p2: [fav(9)] },
    favoritesAt: {},
    favoriteTeams: {},
    teamsAt: {},
    progress: { 'p1:movie-a': prog('a', 1), 'p2:movie-z': prog('z', 1) },
    progressRemoved: {},
    watched: { 'p1:movie-x': true, 'p2:movie-y': true },
    seriesDone: { 'p1:50': { episodes: 6, done: true, at: 1 }, 'p2:51': { episodes: 3, done: true, at: 1 } },
    recentLive: {},
    recentLiveAt: {},
    searches: {},
    searchesAt: {},
  }
  const p1 = extractProfile(state, 'p1')
  assert.deepEqual(Object.keys(p1.progress), ['movie-a'])
  assert.deepEqual(p1.watched, ['movie-x'])
  const next = applyProfile(state, 'p1', { ...p1, watched: ['movie-x', 'movie-w'], progress: {} })
  assert.deepEqual(Object.keys(next.watched).sort(), ['p1:movie-w', 'p1:movie-x', 'p2:movie-y'])
  assert.deepEqual(Object.keys(next.progress), ['p2:movie-z'])
  assert.deepEqual(next.favorites.p2, [fav(9)])
  assert.deepEqual(p1.seriesDone, { 50: { episodes: 6, done: true, at: 1 } })
  assert.deepEqual(Object.keys(next.seriesDone).sort(), ['p1:50', 'p2:51'])
})

test('serie concluida: o registro mais novo vence, inclusive o "nao concluida" de temporada nova', () => {
  const local = { ...empty, seriesDone: { 50: { episodes: 6, done: true, at: now - 100 }, 51: { episodes: 3, done: true, at: now - 100 } } }
  const remote = { ...empty, seriesDone: { 50: { episodes: 6, done: false, at: now - 10 }, 52: { episodes: 2, done: true, at: now } } }
  const { seriesDone } = mergeProfile(local, remote)
  assert.equal(seriesDone[50].done, false)
  assert.equal(seriesDone[51].done, true)
  assert.equal(seriesDone[52].done, true)
})

const ana = { name: 'Ana', color: '#fff' }

test('perfil: aparelho que nunca sincronizou junta pelo lado seguro (infantil, PIN e categorias escondidas)', () => {
  const local = { ...empty, settings: { ...ana, isKids: true, hiddenCategories: ['live:1'] }, settingsAt: 0 }
  const remote = { ...empty, settings: { ...ana, color: '#000', pin: '1234', hiddenCategories: ['vod:2'] }, settingsAt: now - 1000 }
  const { settings } = mergeProfile(local, remote)
  assert.equal(settings.isKids, true)
  assert.equal(settings.pin, '1234')
  assert.equal(settings.color, '#000')
  assert.deepEqual(settings.hiddenCategories.sort(), ['live:1', 'vod:2'])
})

test('perfil: depois disso a edicao mais recente vence (tirar o infantil vale)', () => {
  const local = { ...empty, settings: { ...ana, isKids: true }, settingsAt: now - 5000 }
  const remote = { ...empty, settings: { ...ana, name: 'Ana Clara' }, settingsAt: now }
  const { settings } = mergeProfile(local, remote)
  assert.equal(settings.name, 'Ana Clara')
  assert.equal(settings.isKids, undefined)
})

test('canais e buscas recentes seguem a mesma regra de lista', () => {
  const merged = mergeProfile({ ...empty, recentLive: [3], searches: ['gol'] }, { ...empty, recentLive: [5], recentLiveAt: now - 10, searches: ['novela'], searchesAt: now - 10 })
  assert.deepEqual(merged.recentLive, [5, 3])
  assert.deepEqual(merged.searches, ['novela', 'gol'])
})

test('cada perfil daqui acha o seu na nuvem: chave guardada, depois nome, senao perfil novo', () => {
  const remote = { demo: { ...empty }, k2: { ...empty, settings: { name: 'Ana', color: '#f00' } }, k3: { ...empty, settings: { name: 'Bia', color: '#f00' }, deletedAt: now } }
  const claims = claimKeys(
    [
      { id: 'a', name: 'Demo' },
      { id: 'b', name: 'ana' },
      { id: 'c', name: 'Bia' },
      { id: 'd', name: 'Zé', syncId: 'k9' },
    ],
    remote,
  )
  assert.deepEqual(claims, { a: 'demo', b: 'k2', c: 'c', d: 'k9' })
})
