import type { CapacitorConfig } from '@capacitor/cli'

// App Android (celular e Fire Stick). Abre o site publicado em vez de levar uma copia dentro do APK: cada
// deploy chega no app sozinho, e um APK novo so e preciso quando a parte nativa mudar (plano de 08/10 no
// Obsidian). O `webDir` so serve de pagina de reserva enquanto o site carrega.
const config: CapacitorConfig = {
  appId: 'com.pedreiraflix.app',
  appName: 'PedreiraFlix',
  webDir: 'dist',
  server: {
    url: 'https://pedreiraflix.chrisouzamol.workers.dev',
    androidScheme: 'https',
  },
  plugins: {
    // Tela de ponta a ponta com o fundo do app atras das barras do sistema (o site ja usa viewport-fit=cover e
    // env(safe-area-inset-*)); icones claros nas barras, que ficam sobre o fundo escuro.
    SystemBars: { initialViewportFitValueHint: 'cover', style: 'DARK' },
  },
}

export default config
