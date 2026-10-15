import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildZip, safeName } from '../src/lib/zip.ts'

test('zip com pastas por temporada abre no unzip com o conteudo igual', async () => {
  const a = new Uint8Array(300_000).map((_, i) => i % 251)
  const entries = [
    { path: 'Serie/Temporada 01/E01 - Piloto.mp4', blob: new Blob([a]) },
    { path: 'Serie/Temporada 02/E01 - Ação.mp4', blob: new Blob([new Uint8Array([1, 2, 3])]) },
  ]
  const dir = mkdtempSync(join(tmpdir(), 'zip-'))
  const file = join(dir, 's.zip')
  writeFileSync(file, Buffer.from(await (await buildZip(entries)).arrayBuffer()))
  execFileSync('unzip', ['-tq', file])
  const out = execFileSync('unzip', ['-p', file, 'Serie/Temporada 01/E01 - Piloto.mp4'], { maxBuffer: 1e7 })
  assert.deepEqual(new Uint8Array(out), a)
  const names = execFileSync('python3', ['-I', '-c', 'import zipfile,sys;print("\\n".join(zipfile.ZipFile(sys.argv[1]).namelist()))', file])
  assert.ok(names.toString().includes('Serie/Temporada 02/E01 - Ação.mp4'))
  assert.ok(readFileSync(file).length > 300_000)
})

test('ZIP64 (arquivo e offset acima do limite) tambem abre', async () => {
  const entries = [1, 2, 3].map((n) => ({ path: `T${n}/e.bin`, blob: new Blob([new Uint8Array(500).fill(n)]) }))
  const file = join(mkdtempSync(join(tmpdir(), 'zip-')), 'z.zip')
  writeFileSync(file, Buffer.from(await (await buildZip(entries, undefined, 100)).arrayBuffer()))
  const py = 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(sum(len(z.read(n)) for n in z.namelist()))'
  assert.equal(execFileSync('python3', ['-I', '-c', py, file]).toString().trim(), '1500')
})

test('safeName tira caracteres que o Windows nao aceita', () => {
  assert.equal(safeName('A/B: C?*'), 'A B C')
  assert.equal(safeName('...'), 'sem nome')
})
