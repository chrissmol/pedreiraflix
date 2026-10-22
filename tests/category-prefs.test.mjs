import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrangeCategories } from '../src/lib/categoryPrefs.ts'

const cats = ['1', '2', '3', '4'].map((categoryId) => ({ categoryId }))
const ids = (list) => list.map((c) => c.categoryId)

test('sem preferencias fica igual ao provedor', () => {
  assert.deepEqual(ids(arrangeCategories('live', cats)), ['1', '2', '3', '4'])
})

test('esconde so as do mesmo tipo e reordena; categoria nova vai para o fim', () => {
  const result = arrangeCategories('live', cats, ['live:2', 'movie:3'], ['live:3', 'live:1'])
  assert.deepEqual(ids(result), ['3', '1', '4'])
})
