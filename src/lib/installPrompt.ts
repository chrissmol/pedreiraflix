import { create } from 'zustand'

// Convite para instalar o app (Edge/Chrome no Windows e Chrome no Android): o navegador avisa com o evento
// `beforeinstallprompt` quando da para instalar, e o app guarda o aviso para mostrar "Instalar o app" no menu
// da conta. Sem isso ninguem descobria que dava para instalar (auditoria de 05/10). Safari/iPhone nao tem o
// evento — la a instalacao continua pelo "Compartilhar > Adicionar a Tela de Inicio".
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const useInstallPrompt = create<{ event: InstallPromptEvent | null }>(() => ({ event: null }))

window.addEventListener('beforeinstallprompt', (e) => {
  if (/PedreiraFlixDesktop/.test(navigator.userAgent)) return // ja e o app do Windows (Tauri): nada a instalar
  e.preventDefault() // o navegador nao mostra a propria faixa; o convite fica no menu da conta
  useInstallPrompt.setState({ event: e as InstallPromptEvent })
})
window.addEventListener('appinstalled', () => useInstallPrompt.setState({ event: null }))

export async function installApp() {
  const { event } = useInstallPrompt.getState()
  if (!event) return
  await event.prompt()
  await event.userChoice.catch(() => null)
  useInstallPrompt.setState({ event: null }) // o mesmo aviso so pode ser usado uma vez
}
