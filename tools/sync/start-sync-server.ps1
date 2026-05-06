$port       = 8765
$statusFile = "$env:TEMP\rv4-sync-status.json"
$syncScript = Resolve-Path (Join-Path $PSScriptRoot "SINCRONIZAR-TODOS.ps1")

function Write-Status {
    param([string]$State, [string]$Message)
    @{ state = $State; message = $Message; updatedAt = (Get-Date -Format "dd/MM/yyyy HH:mm") } |
        ConvertTo-Json | Set-Content $statusFile -Encoding UTF8
}

function Get-StatusJson {
    if (Test-Path $statusFile) { return Get-Content $statusFile -Raw -Encoding UTF8 }
    return '{"state":"idle","message":"Servidor listo","updatedAt":""}'
}

Write-Status -State "idle" -Message "Servidor listo"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "[RV4 Server] Escuchando en http://localhost:$port/" -ForegroundColor Cyan

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $res.Headers.Add("Access-Control-Allow-Origin",  "*")
        $res.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
        $res.ContentType = "application/json; charset=utf-8"

        if ($req.HttpMethod -eq "OPTIONS") {
            $res.StatusCode = 204
            $res.Close()
            continue
        }

        $path = $req.Url.LocalPath

        $json = switch ($path) {

            "/health" { '{"state":"ok"}' }

            "/status" { Get-StatusJson }

            "/sync" {
                $cur = Get-StatusJson | ConvertFrom-Json
                if ($cur.state -eq "running") {
                    '{"state":"running","message":"Ya hay una sincronizacion en progreso"}'
                } else {
                    Write-Status -State "running" -Message "Abre el navegador e inicia sesion con tu cuenta Microsoft..."

                    # Abre una ventana de PowerShell visible para que el usuario pueda iniciar sesion
                    $args = "-ExecutionPolicy Bypass -File `"$syncScript`" -StatusFile `"$statusFile`""
                    Start-Process powershell.exe -ArgumentList $args

                    '{"state":"running","message":"Se abrio PowerShell. Inicia sesion en el navegador para continuar."}'
                }
            }

            default {
                $res.StatusCode = 404
                '{"error":"Not found"}'
            }
        }

        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.Close()

    } catch {
        Write-Warning "[RV4 Server] Error: $_"
        try { $ctx.Response.Close() } catch {}
    }
}