#!/usr/bin/env bash
# Emulador de Android TV (o mesmo que Fire TV/Android TV usam) no Mac: cria o AVD `pftv` (1080p, imagem Android TV),
# liga, instala o app e abre. Teclado na janela do emulador: setas = controle, Enter = OK, Esc = Voltar.
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

sed -i.bak "s/^hw.keyboard *= *no/hw.keyboard = yes/" "$ANDROID_AVD_HOME/pftv.avd/config.ini"
adb start-server >/dev/null
if ! adb devices | grep -q "emulator-.*device"; then
  nohup emulator -avd pftv -no-audio -no-boot-anim -gpu auto >/tmp/emulador-tv.log 2>&1 &
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
