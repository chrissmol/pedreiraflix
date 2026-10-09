// App do Windows: uma janela do WebView2 (o motor do Edge) abrindo o site publicado, como o APK faz no Android
// (plano de apps, 08/10). Cada deploy chega no app sozinho; o instalador so muda quando a parte nativa mudar.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("erro ao abrir o PedreiraFlix");
}
