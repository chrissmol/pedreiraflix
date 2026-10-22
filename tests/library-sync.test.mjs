import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyProfile, extractProfile, mergeProfile } from '../src/lib/librarySync.ts'

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
  }
  const p1 = extractProfile(state, 'p1')
  assert.deepEqual(Object.keys(p1.progress), ['movie-a'])
  assert.deepEqual(p1.watched, ['movie-x'])
  const next = applyProfile(state, 'p1', { ...p1, watched: ['movie-x', 'movie-w'], progress: {} })
  assert.deepEqual(Object.keys(next.watched).sort(), ['p1:movie-w', 'p1:movie-x', 'p2:movie-y'])
  assert.deepEqual(Object.keys(next.progress), ['p2:movie-z'])
  assert.deepEqual(next.favorites.p2, [fav(9)])
})
