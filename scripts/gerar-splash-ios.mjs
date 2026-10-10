// Gera as imagens de abertura do iOS (apple-touch-startup-image): fundo do app com o simbolo no centro.
// Sem elas o iPhone mostra uma tela branca antes de o PWA abrir. Uso: node scripts/gerar-splash-ios.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

// [largura pt, altura pt, escala] — iPhones em pe (retrato).
const TELAS = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [420, 912, 3], // Air
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [390, 844, 3], // 12, 13, 14
  [375, 812, 3], // 11 Pro, X, XS, 12/13 mini
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 6/7/8 Plus
  [375, 667, 2], // 6/7/8, SE 2/3
  [320, 568, 2], // SE 1
]
const icone = `data:image/png;base64,${readFileSync(new URL('../public/icon-512.png', import.meta.url)).toString('base64')}`
const browser = await chromium.launch()
for (const [w, h, s] of TELAS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: s })
  await page.setContent(
    `<body style="margin:0;background:#06070c;display:grid;place-items:center;height:100vh"><img src="${icone}" style="width:${Math.round(w * 0.38)}px"></body>`,
  )
  await page.screenshot({ path: new URL(`../public/splash/${w * s}x${h * s}.png`, import.meta.url).pathname })
  await page.close()
}
await browser.close()
// Os <link> do index.html (um por tela):
for (const [w, h, s] of TELAS) {
  console.log(
    `    <link rel="apple-touch-startup-image" href="/splash/${w * s}x${h * s}.png" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${s}) and (orientation: portrait)" />`,
  )
}
