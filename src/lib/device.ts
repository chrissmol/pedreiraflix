// TV (Fire TV/Android TV, Samsung Tizen, LG webOS...): sem download — na TV so se assiste (decisao do
// Christian, 08/10). Pelo user agent, que as TVs anunciam.
// Android sem tela de toque tambem e TV: a WebView do Android TV nem sempre se anuncia como TV no user agent.
export const isTv =
  /\bAFT|Android TV|GoogleTV|SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|AppleTV/i.test(navigator.userAgent) ||
  (/Android/.test(navigator.userAgent) && navigator.maxTouchPoints === 0)

// App instalado (APK, app do Windows, PWA na tela de inicio): aparelho pessoal. No navegador comum pode ser um
// computador compartilhado. `PedreiraFlixDesktop` e o user agent do app do Windows (Tauri).
export const isInstalledApp =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  'Capacitor' in window && (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true ||
  /PedreiraFlixDesktop/.test(navigator.userAgent)
