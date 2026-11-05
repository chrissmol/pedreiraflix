import { useAppLockStore } from '../store/appLock'
import { useActiveProfile } from '../store/profiles'

/** Adult categories are hidden by default; only the device setting "Mostrar conteúdo adulto" shows them, and a
 * kids profile hides them regardless. */
export function useHideAdult(): boolean {
  const showAdult = useAppLockStore((s) => s.showAdult)
  const isKids = Boolean(useActiveProfile()?.isKids)
  return isKids || !showAdult
}
