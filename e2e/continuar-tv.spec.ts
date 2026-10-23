import { expect, test } from '@playwright/test'

// Fileira "Continuar assistindo" do Google TV (plugin nativo do APK 1.5). O plugin so existe no APK; aqui se confere
// o que o site manda para ele: os 10 mais recentes, o mesmo endereco do Inicio e o poster completo pelo proxy.
test('itens da fileira da TV: mais recentes primeiro, caminho do player e poster pelo proxy', async ({ page }) => {
  await page.goto('/login')
  const itens = await page.evaluate(async () => {
    const { itensTv } = await import('/src/lib/continuarTv.ts')
    const base = { image: null, ext: 'mp4', positionSeconds: 60, durationSeconds: 600 }
    const lista = Array.from({ length: 12 }, (_, i) => ({ ...base, kind: 'movie', id: String(i), name: `Filme ${i}`, updatedAt: i }))
    lista.push({ ...base, kind: 'series', id: '5011', name: 'Série - T1E1', image: 'http://provedor.example/p.jpg', updatedAt: 99, seriesId: 50 })
    return itensTv(lista as never, 'https://pedreiraflix.example')
  })
  expect(itens).toHaveLength(10)
  expect(itens[0]).toMatchObject({
    id: 'series-5011',
    episodio: true,
    posicaoMs: 60000,
    duracaoMs: 600000,
    imagem: 'https://pedreiraflix.example/api/stream?url=http%3A%2F%2Fprovedor.example%2Fp.jpg',
  })
  expect(itens[0].path).toBe('/watch/series/5011?ext=mp4&name=S%C3%A9rie%20-%20T1E1&image=http%3A%2F%2Fprovedor.example%2Fp.jpg&seriesId=50')
  expect(itens[1]).toMatchObject({ id: 'movie-11', imagem: '', episodio: false })
})
