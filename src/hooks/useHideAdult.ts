import { useActiveProfile } from '../store/profiles'

/** Adult categories are hidden by default; only the active profile's "Mostrar conteúdo adulto" shows them, and a
 * kids profile hides them regardless. */
export function useHideAdult(): boolean {
  const profile = useActiveProfile()
  return Boolean(profile?.isKids) || !profile?.showAdult
}
