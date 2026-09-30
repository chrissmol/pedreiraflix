import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const REPO = 'chrissmol/pedreiraflix'
const READY = 'pedreira:claude-ready'
const RUNNING = 'pedreira:claude-running'
const REVIEW = 'pedreira:review-ready'
const FAILED = 'pedreira:claude-failed'
const STATE = [READY, RUNNING, REVIEW, FAILED]
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000

export interface Issue {
  number: number
  title: string
  body: string
  labels: { name: string }[]
}

export interface ShResult {
  code: number
  stdout: string
  stderr: string
}

export type Sh = (cmd: 'gh' | 'git', args: string[], o?: { cwd?: string; input?: string }) => Promise<ShResult>
export type Exec = (cmd: string, args: string[], o?: { cwd?: string; input?: string; timeoutMs?: number }) => Promise<ShResult>

export interface WorkerCtx {
  sh: Sh
  exec: Exec
  repo: string
  repoDir: string
  logDir: string
}

export interface WorkerArgs {
  dry?: boolean
  issue?: number
  claudeTimeoutMs?: number
}

export class Abort extends Error {}

export const realExec: Exec = async (cmd, args, o = {}) => {
  const bin = process.platform === 'win32' ? 'cmd.exe' : cmd
  const binArgs = process.platform === 'win32' ? ['/d', '/s', '/c', cmd, ...args] : args
  const r = spawnSync(bin, binArgs, { cwd: o.cwd, input: o.input, encoding: 'utf8', maxBuffer: 64 << 20, timeout: o.timeoutMs })
  const timedOut = r.error && 'code' in r.error && r.error.code === 'ETIMEDOUT'
  return { code: timedOut ? 124 : (r.status ?? 1), stdout: r.stdout ?? '', stderr: r.stderr || r.error?.message || '' }
}

const realSh: Sh = async (cmd, args, o = {}) => {
  const r = spawnSync(cmd, args, { cwd: o.cwd, input: o.input, encoding: 'utf8', maxBuffer: 64 << 20 })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr || r.error?.message || '' }
}

async function run(sh: Sh, cmd: 'gh' | 'git', args: string[], o?: { cwd?: string; input?: string }): Promise<string> {
  const r = await sh(cmd, args, o)
  if (r.code !== 0) throw new Abort(`${cmd} ${args.slice(0, 3).join(' ')} falhou (${r.code}): ${r.stderr.trim() || r.stdout.trim()}`)
  return r.stdout
}

function gh(ctx: WorkerCtx) {
  const call = (args: string[], input?: string) => run(ctx.sh, 'gh', [...args, '-R', ctx.repo], { input })
  return {
    issue: async (n: number): Promise<Issue> => JSON.parse(await call(['issue', 'view', String(n), '--json', 'number,title,body,labels'])),
    ready: async (): Promise<Issue[]> => JSON.parse(await call(['issue', 'list', '--state', 'open', '--label', READY, '--limit', '20', '--json', 'number,title,body,labels'])),
    addLabels: async (n: number, labels: string) => { await call(['issue', 'edit', String(n), '--add-label', labels]) },
    removeLabels: async (n: number, labels: string) => { if (labels) await call(['issue', 'edit', String(n), '--remove-label', labels]) },
    comment: async (n: number, body: string) => { await call(['issue', 'comment', String(n), '--body-file', '-'], body) },
    prCreate: async (title: string, body: string, base: string, head: string): Promise<string> =>
      (await call(['pr', 'create', '--title', title, '--body-file', '-', '--base', base, '--head', head], body)).trim(),
  }
}

function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'issue'
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function cleanMain(ctx: WorkerCtx): Promise<void> {
  const git = (args: string[]) => run(ctx.sh, 'git', args, { cwd: ctx.repoDir })
  if ((await git(['status', '--porcelain'])).trim()) throw new Abort('working tree sujo; worker não inicia')
  const branch = (await git(['branch', '--show-current'])).trim()
  if (branch !== 'main') throw new Abort(`worker deve iniciar na main; branch atual: ${branch || 'detached'}`)
  await git(['fetch', '--quiet', 'origin', 'main'])
  const [ahead, behind] = (await git(['rev-list', '--left-right', '--count', 'HEAD...origin/main'])).trim().split(/\s+/).map(Number)
  if (ahead || behind) throw new Abort(`main diverge de origin/main (à frente ${ahead}, atrás ${behind})`)
}

async function setState(ctx: WorkerCtx, issue: number, next: string): Promise<void> {
  const api = gh(ctx)
  await api.addLabels(issue, next)
  await api.removeLabels(issue, STATE.filter((s) => s !== next).join(','))
}

function promptFor(issue: Issue): string {
  return [
    '/ponytail full',
    '',
    `Trabalhe no repositório PedreiraFlix somente para a issue #${issue.number}: ${issue.title}.`,
    '',
    'Antes de alterar:',
    '- confirme que entendeu o escopo da issue;',
    '- leia AGENTS.md e arquivos relevantes;',
    '- mantenha a mudança pequena e focada.',
    '',
    'Regras:',
    '- não faça merge;',
    '- não faça deploy/publicação;',
    '- não exponha segredos;',
    '- não altere tarefas fora desta issue;',
    '- gaste o mínimo de tokens possível: investigue só os arquivos necessários e evite relatórios longos;',
    '- prefira a menor mudança correta; nada de abstração “para depois”;',
    '- rode validação relevante (lint/build/e2e direcionado quando aplicável).',
    '',
    'Ao terminar, deixe commits locais prontos para push e responda curto: mudança feita, testes executados e riscos.',
    '',
    'Issue:',
    issue.body.trim(),
  ].join('\n')
}

export async function runOnce(ctx: WorkerCtx, args: WorkerArgs = {}): Promise<string[]> {
  const api = gh(ctx)
  await cleanMain(ctx)
  const ready = args.issue ? [await api.issue(args.issue)] : await api.ready()
  if (ready.length === 0) return ['fila vazia']
  if (ready.length > 1) throw new Abort(`mais de uma issue pronta (${ready.map((i) => `#${i.number}`).join(', ')}); uma tarefa por vez`)

  const issue = ready[0]
  const branch = `codex/claude-${issue.number}-${slugify(issue.title)}`
  const log = join(ctx.logDir, `${stamp()}-issue-${issue.number}.log`)
  const timeoutMs = args.claudeTimeoutMs ?? Number(process.env.PEDREIRA_CLAUDE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const lines = [`issue #${issue.number}: ${issue.title}`, `branch: ${branch}`]

  if (args.dry) return [...lines, `[dry-run] moveria ${READY} -> ${RUNNING}`, '[dry-run] executaria Claude Code e abriria PR sem merge']

  mkdirSync(ctx.logDir, { recursive: true })
  try {
    await setState(ctx, issue.number, RUNNING)
    const exists = (await ctx.sh('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: ctx.repoDir })).code === 0
    await run(ctx.sh, 'git', exists ? ['switch', branch] : ['switch', '-c', branch], { cwd: ctx.repoDir })
    const beforeHead = (await run(ctx.sh, 'git', ['rev-parse', 'HEAD'], { cwd: ctx.repoDir })).trim()

    writeFileSync(log, [`# Issue #${issue.number}: ${issue.title}`, '', `Started: ${new Date().toISOString()}`, `TimeoutMs: ${timeoutMs}`, ''].join('\n'), 'utf8')
    const claude = await ctx.exec('claude.cmd', ['-p', '--permission-mode', 'dontAsk', '--allowedTools', 'Read', 'Write', 'Edit', 'PowerShell'], {
      cwd: ctx.repoDir,
      input: promptFor(issue),
      timeoutMs,
    })
    appendFileSync(log, ['## stdout', claude.stdout, '', '## stderr', claude.stderr, '', `Finished: ${new Date().toISOString()}`, `ExitCode: ${claude.code}`, ''].join('\n'), 'utf8')
    if (claude.code === 124) throw new Abort(`Claude excedeu o timeout de ${Math.round(timeoutMs / 1000)}s; log: ${log}`)
    if (claude.code !== 0) throw new Abort(`Claude falhou (${claude.code}); log: ${log}`)

    const changed = (await run(ctx.sh, 'git', ['status', '--porcelain'], { cwd: ctx.repoDir })).trim()
    const afterHead = (await run(ctx.sh, 'git', ['rev-parse', 'HEAD'], { cwd: ctx.repoDir })).trim()
    if (changed) {
      await run(ctx.sh, 'git', ['add', '-A'], { cwd: ctx.repoDir })
      await run(ctx.sh, 'git', ['commit', '-m', `claude: issue #${issue.number}`], { cwd: ctx.repoDir })
    } else if (afterHead === beforeHead) {
      throw new Abort(`Claude terminou sem alterações; log: ${log}`)
    }

    await run(ctx.sh, 'git', ['push', '-u', 'origin', branch], { cwd: ctx.repoDir })
    const pr = await api.prCreate(`Claude: ${issue.title}`, `Closes #${issue.number}\n\nWorker log local: ${log}\n\nMerge e deploy não autorizados automaticamente.`, 'main', branch)
    await api.comment(issue.number, `Claude Code concluiu a execução automática.\n\nPR: ${pr}\nLog local: ${log}\n\nEstado: aguardando revisão; merge/deploy não foram executados.`)
    await setState(ctx, issue.number, REVIEW)
    return [...lines, `PR criado: ${pr}`, `log: ${log}`, `estado: ${REVIEW}`]
  } catch (err) {
    try { await setState(ctx, issue.number, FAILED) } catch {}
    try { await api.comment(issue.number, `Worker falhou de forma segura: ${(err as Error).message}\n\nLog local: ${log}`) } catch {}
    throw err
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dry: { type: 'boolean' },
      issue: { type: 'string' },
      'claude-timeout-ms': { type: 'string' },
    },
  })
  const ctx: WorkerCtx = {
    sh: realSh,
    exec: realExec,
    repo: REPO,
    repoDir: process.cwd(),
    logDir: join(process.cwd(), '.pedreira', 'claude-worker', 'logs'),
  }
  const lines = await runOnce(ctx, {
    dry: values.dry,
    issue: values.issue ? Number(values.issue) : undefined,
    claudeTimeoutMs: values['claude-timeout-ms'] ? Number(values['claude-timeout-ms']) : undefined,
  })
  console.log(lines.join('\n'))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code }, (err) => {
    console.error(err instanceof Abort ? `ABORTADO: ${err.message}` : err)
    process.exitCode = 1
  })
}
