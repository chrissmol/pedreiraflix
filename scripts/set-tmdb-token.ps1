# Grava o secret TMDB_TOKEN no Worker, conferindo o que foi colado ANTES de enviar.
#
# Existe porque colar o token direto no prompt do wrangler falhou tres vezes seguidas: a area de
# transferencia trazia texto extra junto (o token duplicado, ou o final de um comando curl), e o
# wrangler aceita qualquer coisa calado. O resultado era o TMDB respondendo 401 em producao sem dizer
# por que. Aqui o texto e validado primeiro e so sobe se o TMDB aceitar.
#
# Uso: .\scripts\set-tmdb-token.ps1
param([string]$Name = 'TMDB_TOKEN')

$ErrorActionPreference = 'Stop'

$secure = Read-Host 'Cole o token de leitura do TMDB (nao aparece na tela)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

function Fail($msg) {
    Write-Host "X $msg" -ForegroundColor Red
    Write-Host '  Dica: cole no Bloco de Notas primeiro, deixe so o token e copie de la.' -ForegroundColor DarkGray
    exit 1
}

# Um token v4 do TMDB e um JWT: tres partes separadas por ponto, sem espaco. Nada aqui imprime o valor.
if (-not $token) { Fail 'Nada foi colado.' }
if ($token -notmatch '^eyJ') { Fail 'Nao comeca com eyJ - isso e a chave v3 curta ou texto errado, nao o token de leitura.' }
if ($token -match '\s') { Fail 'Tem espaco ou quebra de linha no meio.' }
$parts = $token.Split('.').Count
if ($parts -ne 3) { Fail "Tem $parts partes separadas por ponto, deveria ter 3 - veio texto extra junto (colagem duplicada ou pedaco de comando)." }

Write-Host 'Formato ok. Conferindo no TMDB...' -ForegroundColor DarkGray
try {
    Invoke-RestMethod -Uri 'https://api.themoviedb.org/3/authentication' -Headers @{ Authorization = "Bearer $token" } | Out-Null
}
catch { Fail 'O TMDB recusou este token (401). Gere um novo em https://www.themoviedb.org/settings/api' }

Write-Host 'O TMDB aceitou. Gravando no Worker...' -ForegroundColor DarkGray
$token | & npx.cmd wrangler secret put $Name
$code = $LASTEXITCODE
Remove-Variable token -ErrorAction SilentlyContinue

if ($code -ne 0) { Write-Host "X wrangler falhou (codigo $code)." -ForegroundColor Red; exit $code }
Write-Host "OK: $Name gravado. Teste com:" -ForegroundColor Green
Write-Host '  curl.exe -s -D - -o NUL "https://pedreiraflix.chrisouzamol.workers.dev/api/tmdb?title=Matrix&year=1999"' -ForegroundColor DarkGray
