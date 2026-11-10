// Hash do codigo do grupo guardado no aparelho (ver GroupCodeGate).
export const CHAVE = 'pf_grupo'
export function lerGrupo() {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}
/** Guarda o hash do grupo vindo de outro aparelho (pareamento com o celular). */
export function guardarGrupo(token: string) {
  try {
    localStorage.setItem(CHAVE, token)
  } catch {
    // sem localStorage o app volta a pedir o codigo
  }
}
