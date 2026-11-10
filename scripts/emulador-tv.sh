#!/usr/bin/env bash
# Emulador de Android TV (o mesmo que Fire TV/Android TV usam) no Mac: cria o AVD `pftv` (1080p, imagem Android TV),
# liga, instala o app e abre. Teclado na janela do emulador: setas = controle, Enter = OK, Esc = Voltar.
# Dica: para testar mudanca local use `npx vite build && npx vite preview --port 5173 --host 127.0.0.1` (o `vite` de dev pesa no emulador).
# Uso: scripts/emulador-tv.sh [--url http://10.0.2.2:5173]   (sem --url o app abre o site publicado)
# Pre-requisitos (os mesmos do estressar-apk): JDK em ~/.local/jdk, Android SDK + emulador em ~/.local/android.
set -euo pipefail
ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/android}"; JAVA_HOME="${JAVA_HOME:-$HOME/.local/jdk}"
export ANDROID_HOME JAVA_HOME ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.android/avd}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"
cd "$(dirname "$0")/.."
[ "${1:-}" = "--url" ] && TEST_URL="$2" || TEST_URL=""

case "$(uname -m)" in arm64) ABI=arm64-v8a ;; *) ABI=x86_64 ;; esac
IMG="system-images;android-34;android-tv;$ABI"
if ! avdmanager list avd | grep -q "Name: pftv"; then
  yes | sdkmanager --licenses >/dev/null || true
  sdkmanager "$IMG"
  echo no | avdmanager create avd -n pftv -k "$IMG" -d tv_1080p --force
fi

# O AVD de TV vem com hw.keyboard=no e o emulador ignorava o teclado do Mac (medido no Mac do Chris, 10/11).
CFG="$ANDROID_AVD_HOME/pftv.avd/config.ini"
sed -i.bak "s/^hw.keyboard *= *.*/hw.keyboard = yes/" "$CFG"
grep -q "^hw.keyboard" "$CFG" || echo "hw.keyboard = yes" >> "$CFG"
# Desempenho (medido no MacBook Air 8 GB, 10/11): GPU do host + 2 GB de RAM derrubaram os frames travados de 75% para 26%
# (p95 85ms -> 46ms). O padrao do AVD vinha com GPU desligada (render por software) e 1,5 GB.
sed -i.bak -e "s/^hw.gpu.enabled *= *.*/hw.gpu.enabled = yes/" -e "s/^hw.gpu.mode *= *.*/hw.gpu.mode = host/" -e "s/^hw.ramSize *= *.*/hw.ramSize = 2048M/" "$CFG"
adb start-server >/dev/null
if ! adb devices | grep -q "emulator-.*device"; then
  nohup emulator -avd pftv -no-audio -no-boot-anim -gpu host >/tmp/emulador-tv.log 2>&1 &
  adb wait-for-device
fi
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done

# APK de debug (com a URL de teste, se pedida) e depois deixa a configuracao de producao de volta no projeto.
PEDREIRAFLIX_TEST_URL="$TEST_URL" npx cap sync android
(cd android && ./gradlew assembleDebug -q)
npx cap sync android
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.pedreiraflix.app.teste/com.pedreiraflix.app.MainActivity
echo "PedreiraFlix aberto no emulador de TV. Setas, Enter = OK, Esc = Voltar na janela do emulador."
