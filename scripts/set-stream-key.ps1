# Cria o secret STREAM_KEY no Worker: a chave que cifra usuario e senha nas URLs de video (worker/streamSession.js).
#
# Ninguem precisa ver nem guardar esta chave: ela e gerada aqui, com gerador criptografico, e vai direto para o
# Cloudflare. Rodar de novo troca a chave; os aparelhos pegam um codigo novo sozinhos na proxima abertura do app.
# Ate este secret existir, o app continua funcionando no formato antigo (senha na URL do video).
#
# Uso: .\scripts\set-stream-key.ps1
$ErrorActionPreference = 'Stop'

$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$key = [Convert]::ToBase64String($bytes)

Write-Host 'Chave gerada (nao aparece na tela). Gravando no Worker...' -ForegroundColor DarkGray
$key | & npx.cmd wrangler secret put STREAM_KEY
$code = $LASTEXITCODE
Remove-Variable key, bytes -ErrorAction SilentlyContinue

if ($code -ne 0) { Write-Host "X wrangler falhou (codigo $code)." -ForegroundColor Red; exit $code }
Write-Host 'OK: STREAM_KEY gravado. Feche e abra o app para ele pegar o codigo novo.' -ForegroundColor Green
Write-Host 'Conferir (com a chave responde 200 e um {"sid":...}; sem ela, 204 vazio):' -ForegroundColor DarkGray
Write-Host '  curl.exe -s -i -X POST -H "content-type: application/json" -d "{\"base\":\"http://example.com\",\"username\":\"teste\",\"password\":\"teste\"}" https://pedreiraflix.chrisouzamol.workers.dev/api/session' -ForegroundColor DarkGray
