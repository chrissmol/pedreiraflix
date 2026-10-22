/** Quando um filme/episodio conta como visto: passou de 95% ou ja esta nos creditos. Creditos sao estimados
 * (no maximo 8 min no filme, 3 min no episodio, e nunca mais de 10% da duracao), porque o provedor nao diz
 * onde eles comecam. Quem para na hora dos creditos nao fica preso em "Continuar assistindo". */
export function isFinished(kind: 'movie' | 'series', positionSeconds: number, durationSeconds: number): boolean {
  if (!durationSeconds) return false
  const left = durationSeconds - positionSeconds
  return positionSeconds / durationSeconds > 0.95 || left <= Math.min(durationSeconds * 0.1, kind === 'movie' ? 480 : 180)
}
