import { itemKey } from './search.ts'

/** O provedor cadastra a mesma obra mais de uma vez (dublado, legendado, 4K): sem os enfeites ("[L]", "[4K]"), que o
 * app tira dos nomes, os cartoes ficavam iguais lado a lado. Fica um cartao por obra (nome limpo, com o ano, para nao
 * juntar refilmagens); as outras ficam em `versions`, para escolher na pagina do titulo. Nao muda os itens recebidos:
 * eles ficam no cache e a mesma lista e juntada de novo a cada leitura. */
export function mergeVersions<T extends { name: string; versions?: T[] }>(items: T[]): T[] {
  const at = new Map<string, number>()
  const out: T[] = []
  for (const item of items) {
    const key = itemKey(item)
    const i = at.get(key)
    if (i === undefined) {
      at.set(key, out.length)
      out.push(item)
    } else {
      out[i] = { ...out[i], versions: [...(out[i].versions ?? [out[i]]), item] }
    }
  }
  return out
}

/** Um cartao por obra numa lista que junta categorias (busca, "Adicionados recentemente"). */
export function firstPerWork<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = itemKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
