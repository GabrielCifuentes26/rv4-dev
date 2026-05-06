param(
    [string]$MesA = "may 26",
    [string]$SupabaseServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY,
    [string]$StatusFile = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root
$pbiDir = Join-Path $root "tools\powerbi"

function Set-Status {
    param([string]$State, [string]$Message)
    if ([string]::IsNullOrWhiteSpace($StatusFile)) { return }
    @{ state = $State; message = $Message; updatedAt = (Get-Date -Format "dd/MM/yyyy HH:mm") } |
        ConvertTo-Json | Set-Content $StatusFile -Encoding UTF8
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  RV4 - Sincronizacion Power BI" -ForegroundColor Cyan
Write-Host "  Mes: $MesA" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Set-Status -State "running" -Message "Autenticando con Power BI..."
Write-Host "[1/7] Autenticando con Power BI..." -ForegroundColor Yellow
Connect-PowerBIServiceAccount | Out-Null
Write-Host "      Sesion iniciada." -ForegroundColor Green
Write-Host ""

$proyectos = @(
    @{ Script = "sync-powerbi-bse.ps1"; Nombre = "BSE - Bosques de Santa Elena" },
    @{ Script = "sync-powerbi-bdj.ps1"; Nombre = "BDJ - Bosques de Jalapa" },
    @{ Script = "sync-powerbi-bdp.ps1"; Nombre = "BDP - Bosques de Pinula" },
    @{ Script = "sync-powerbi-cse.ps1"; Nombre = "CSE - Condado Santa Elena" },
    @{ Script = "sync-powerbi-rdb.ps1"; Nombre = "RDB - Residencias Del Bosque" },
    @{ Script = "sync-powerbi-hlq.ps1"; Nombre = "HLQ - Hacienda La Querencia" }
)

$ok = @()
$err = @()
$i = 2

foreach ($p in $proyectos) {
    Write-Host "[$i/7] $($p.Nombre)..." -ForegroundColor Yellow
    Set-Status -State "running" -Message "Sincronizando $($p.Nombre)..."
    try {
        & (Join-Path $pbiDir $p.Script) -MesA $MesA -UploadSupabase -SupabaseServiceKey $SupabaseServiceKey
        $ok += $p.Nombre
        Write-Host "      OK" -ForegroundColor Green
    } catch {
        $err += "$($p.Nombre): $($_.Exception.Message)"
        Write-Host "      ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
    $i++
    Write-Host ""
}

Write-Host "=============================================" -ForegroundColor Cyan
$ok  | ForEach-Object { Write-Host "  OK   $_" -ForegroundColor Green }
$err | ForEach-Object { Write-Host "  FAIL $_" -ForegroundColor Red }
Write-Host ""

if ($err.Count -gt 0) {
    Set-Status -State "error" -Message "Completado con errores: $($err -join ' | ')"
    Write-Host "Completado con $($err.Count) error(es)." -ForegroundColor Red
    Read-Host "Presiona Enter para cerrar"
    exit 1
}

Set-Status -State "completed" -Message "Todos los proyectos actualizados correctamente a $MesA"
Write-Host "Listo. Todos los proyectos actualizados a $MesA." -ForegroundColor Green
Start-Sleep -Seconds 3