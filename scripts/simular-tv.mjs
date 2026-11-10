// Simulador de TV para o Mac (ou qualquer PC): abre o app numa janela do tamanho de uma TV, anuncia o user agent de
// uma TV (o app entra no modo TV: menu lateral, so setas + OK) e deixa o teclado fazer de controle remoto.
// Uso: npm run simular-tv [-- --tv firetv|samsung] [--url http://localhost:5173] [--cpu 4]
//   Setas = setas | Enter = OK | Backspace ou Esc = Voltar. --cpu N deixa a CPU N vezes mais lenta (TV fraca).
// Padrao: o site publicado. Para testar mudanca local: npm run dev:web (ou vite) e --url http://localhost:5173.
import { chromium } from 'playwright'

const arg = (k, d) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : d)
const TVS = {
  firetv: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36',
}
const tv = arg('tv', 'firetv')
if (!TVS[tv]) throw new Error(`--tv: ${Object.keys(TVS).join(' ou ')}`)
const url = arg('url', 'https://pedreiraflix.chrisouzamol.workers.dev')

const browser = await chromium.launch({ headless: process.argv.includes('--headless'), args: ['--window-size=980,640', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, userAgent: TVS[tv], hasTouch: false })
const page = await ctx.newPage()
const cpu = Number(arg('cpu', 1))
if (cpu > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu })
await page.goto(url)
console.log(`TV simulada (${tv}, 960x540${cpu > 1 ? `, CPU ${cpu}x mais lenta` : ''}) em ${url}\nSetas, Enter = OK, Backspace/Esc = Voltar. Feche a janela para sair.`)
if (process.argv.includes('--headless')) console.log('modo TV:', await page.evaluate(() => document.documentElement.classList.contains('tv')))
else await new Promise((r) => page.on('close', r))
await browser.close()
