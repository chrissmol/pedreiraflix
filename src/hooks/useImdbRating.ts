import { useEffect, useState } from 'react'
import { getTmdbInfo, type TmdbInfo } from '../lib/tmdb'

export interface ImdbQuery {
  title: string
  /** Ano ou data ("2014", "2014-11-06"); ajuda o TMDB a achar o titulo certo. */
  year?: string | number | null
  kind: 'movie' | 'tv'
}

/** Nota do IMDb ("7.8") de um titulo, via /api/tmdb (o Worker guarda cada nota no KV NOTAS). So pergunta
 * com `enabled`, para os posteres pedirem apenas quando aparecem na tela. */
export function useImdbRating(query: ImdbQuery | null | undefined, enabled = true): string | null {
  return useTmdbInfo(query, enabled)?.imdbRating ?? null
}

/** O que o /api/tmdb sabe do titulo (nota, logo...), do titulo atual e nunca do anterior. */
export function useTmdbInfo(query: ImdbQuery | null | undefined, enabled = true): TmdbInfo | null {
  const title = query?.title
  const year = query?.year != null ? String(query.year) : null
  const kind = query?.kind
  const key = `${kind}:${title}:${year}`
  // Guarda de qual titulo e a nota, para o destaque nao mostrar a do anterior enquanto busca a nova.
  const [found, setFound] = useState<{ key: string; info: TmdbInfo | null } | null>(null)
  useEffect(() => {
    if (!title || !kind || !enabled) return
    let cancelled = false
    getTmdbInfo(title, year, kind).then((info) => !cancelled && setFound({ key, info }))
    return () => {
      cancelled = true
    }
  }, [title, year, kind, key, enabled])
  return found?.key === key ? found.info : null
}
