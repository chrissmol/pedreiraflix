import { useEffect, useState } from 'react'
import { getTmdbInfo } from '../lib/tmdb'

export interface ImdbQuery {
  title: string
  /** Ano ou data ("2014", "2014-11-06"); ajuda o TMDB a achar o titulo certo. */
  year?: string | number | null
  kind: 'movie' | 'tv'
}

/** Nota do IMDb ("7.8") de um titulo, via /api/tmdb (o Worker guarda cada nota no KV NOTAS). So pergunta
 * com `enabled`, para os posteres pedirem apenas quando aparecem na tela. */
export function useImdbRating(query: ImdbQuery | null | undefined, enabled = true): string | null {
  const title = query?.title
  const year = query?.year != null ? String(query.year) : null
  const kind = query?.kind
  const key = `${kind}:${title}:${year}`
  // Guarda de qual titulo e a nota, para o destaque nao mostrar a do anterior enquanto busca a nova.
  const [found, setFound] = useState<{ key: string; rating: string | null } | null>(null)
  useEffect(() => {
    if (!title || !kind || !enabled) return
    let cancelled = false
    getTmdbInfo(title, year, kind).then((info) => !cancelled && setFound({ key, rating: info?.imdbRating ?? null }))
    return () => {
      cancelled = true
    }
  }, [title, year, kind, key, enabled])
  return found?.key === key ? found.rating : null
}
