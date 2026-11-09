import { displayTitle, movieYear, withoutYear } from './displayTitle.ts'
import { searchKey } from './search.ts'

type Named = { name: string; year?: string | null }

const baseCache = new WeakMap<object, string>()
function baseKey(item: Named): string {
  let k = baseCache.get(item)
  if (k === undefined) baseCache.set(item, (k = searchKey(withoutYear(displayTitle(item.name)))))
  return k
}

/** Uma chave por obra para cada item: nome limpo mais o ano. O provedor poe o "(2026)" so em algumas copias ("Maquina de
 * Guerra" e "Maquina de Guerra (2026)"): sem ano a copia entra na obra que ja tem ano; anos diferentes (refilmagens) ficam separados. */
export function workKeys(items: Named[]): string[] {
  const groups = new Map<string, { id: string; year: number | null }[]>()
  const years = new Map<string, Set<number>>()
  for (const item of items) {
    const y = movieYear(item)
    if (y) (years.get(baseKey(item)) ?? years.set(baseKey(item), new Set()).get(baseKey(item))!).add(y)
  }
  return items.map((item) => {
    const base = baseKey(item)
    const year = movieYear(item)
    // Jumanji (1995) e Jumanji (2017): um "Jumanji" sem ano nao da para saber de qual e, fica sozinho.
    const lone = year === null && (years.get(base)?.size ?? 0) > 1
    const list = groups.get(base) ?? groups.set(base, []).get(base)!
    const g = lone ? undefined : list.find((x) => year === null || x.year === null || x.year === year)
    if (g) {
      g.year ??= year
      return g.id
    }
    list.push({ id: `${base} ${year ?? ''}${list.length ? ` #${list.length}` : ''}`, year })
    return list[list.length - 1].id
  })
}

/** O provedor cadastra a mesma obra mais de uma vez (dublado, legendado, 4K): sem os enfeites ("[L]", "[4K]"), que o
 * app tira dos nomes, os cartoes ficavam iguais lado a lado. Fica um cartao por obra (nome limpo, com o ano, para nao
 * juntar refilmagens); as outras ficam em `versions`, para escolher na pagina do titulo. Nao muda os itens recebidos:
 * eles ficam no cache e a mesma lista e juntada de novo a cada leitura. Aceita itens ja juntados (fileiras que misturam
 * categorias). */
export function mergeVersions<T extends Named & { streamId?: number; seriesId?: number; versions?: T[] }>(items: T[]): T[] {
  const keys = workKeys(items)
  const at = new Map<string, number>()
  const out: T[] = []
  items.forEach((item, n) => {
    const i = at.get(keys[n])
    if (i === undefined) {
      at.set(keys[n], out.length)
      out.push(item)
    } else {
      const have = out[i].versions ?? [out[i]]
      const idOf = (v: T) => v.streamId ?? v.seriesId
      const extra = (item.versions ?? [item]).filter((v) => !have.some((h) => idOf(h) !== undefined && idOf(h) === idOf(v)))
      if (extra.length) out[i] = { ...out[i], versions: [...have, ...extra] }
    }
  })
  return out
}

/** Um cartao por obra numa lista que junta categorias (busca, "Adicionados recentemente"). */
export function firstPerWork<T extends Named>(items: T[]): T[] {
  const keys = workKeys(items)
  const seen = new Set<string>()
  return items.filter((_, i) => !seen.has(keys[i]) && seen.add(keys[i]))
}

const TAGS: [RegExp, string][] = [
  [/^(l|leg|legendado)$/i, 'Legendado'],
  [/^(d|dub|dublado)$/i, 'Dublado'],
]

/** Nome do botao de cada versao: as marcas entre colchetes do nome cru ("[L]" vira "Legendado", "[4K]" fica 4K).
 * Sem marca nenhuma, "Versao 2". */
export function versionLabel(rawName: string, index: number): string {
  const tags = [...rawName.matchAll(/\[([^\]]+)\]/g)].map(([, t]) => t.trim()).filter(Boolean)
  const labels = [...new Set(tags.map((t) => TAGS.find(([re]) => re.test(t))?.[1] ?? t.toUpperCase()))]
  return labels.length ? labels.join(' · ') : `Versão ${index + 1}`
}
