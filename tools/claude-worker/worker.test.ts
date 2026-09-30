import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Abort, type Sh, type ShResult, runOnce } from './worker.ts'

const ok = (stdout = ''): ShResult => ({ code: 0, stdout, stderr: '' })

test('dry-run plans exactly one ready issue without changing labels', async () => {
  const calls: string[] = []
  const sh: Sh = async (cmd, args) => {
    calls.push(`${cmd} ${args.join(' ')}`)
    if (cmd === 'git' && args[0] === 'status') return ok('')
    if (cmd === 'git' && args[0] === 'branch') return ok('main\n')
    if (cmd === 'git' && args[0] === 'fetch') return ok('')
    if (cmd === 'git' && args[0] === 'rev-list') return ok('0\t0\n')
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'list') {
      return ok(JSON.stringify([{ number: 7, title: 'Canal anterior', body: 'Escopo pequeno', labels: [] }]))
    }
    throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`)
  }

  const lines = await runOnce({ sh, exec: async () => ok(''), repo: 'owner/repo', repoDir: 'repo', logDir: 'logs' }, { dry: true })
  assert.equal(lines.some((line) => line.includes('codex/claude-7-canal-anterior')), true)
  assert.equal(calls.some((call) => call.includes('issue edit')), false)
})

test('aborts when more than one issue is ready', async () => {
  const sh: Sh = async (cmd, args) => {
    if (cmd === 'git' && args[0] === 'status') return ok('')
    if (cmd === 'git' && args[0] === 'branch') return ok('main\n')
    if (cmd === 'git' && args[0] === 'fetch') return ok('')
    if (cmd === 'git' && args[0] === 'rev-list') return ok('0\t0\n')
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'list') {
      return ok(JSON.stringify([
        { number: 1, title: 'A', body: 'A', labels: [] },
        { number: 2, title: 'B', body: 'B', labels: [] },
      ]))
    }
    throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`)
  }

  await assert.rejects(
    runOnce({ sh, exec: async () => ok(''), repo: 'owner/repo', repoDir: 'repo', logDir: 'logs' }),
    Abort,
  )
})

test('full run moves labels, commits Claude changes and opens a PR', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'pedreira-worker-'))
  const calls: string[] = []
  const sh: Sh = async (cmd, args) => {
    calls.push(`${cmd} ${args.join(' ')}`)
    if (cmd === 'git' && args[0] === 'status') return ok(calls.includes('git switch -c codex/claude-8-melhorar-player') ? ' M src/App.tsx\n' : '')
    if (cmd === 'git' && args[0] === 'branch') return ok('main\n')
    if (cmd === 'git' && args[0] === 'fetch') return ok('')
    if (cmd === 'git' && args[0] === 'rev-list') return ok('0\t0\n')
    if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === '--verify') return { code: 1, stdout: '', stderr: '' }
    if (cmd === 'git' && args[0] === 'rev-parse') return ok('abc123\n')
    if (cmd === 'git') return ok('')
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') return ok(JSON.stringify({ number: 8, title: 'Melhorar player', body: 'Faça pouco', labels: [] }))
    if (cmd === 'gh' && args[0] === 'issue') return ok('')
    if (cmd === 'gh' && args[0] === 'pr') return ok('https://github.com/owner/repo/pull/9\n')
    throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`)
  }

  try {
    const lines = await runOnce({
      sh,
      exec: async (_cmd, _args, options) => {
        assert.match(options?.input ?? '', /não faça merge/)
        assert.match(options?.input ?? '', /^\/ponytail full/)
        assert.match(options?.input ?? '', /mínimo de tokens/)
        return ok('feito')
      },
      repo: 'owner/repo',
      repoDir: 'repo',
      logDir: temp,
    }, { issue: 8, claudeTimeoutMs: 1000 })
    assert.equal(lines.some((line) => line.includes('PR criado')), true)
    assert.equal(calls.includes('git commit -m claude: issue #8'), true)
    assert.equal(calls.some((call) => call.includes('pr create')), true)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
