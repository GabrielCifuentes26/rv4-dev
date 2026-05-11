param(
    [string]$MesA = "may 26",
    [switch]$UploadSupabase,
    [string]$SupabaseServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"

$WorkspaceId = "d111fc11-b7f3-4976-b74b-99f47f06bd22"
$DatasetId   = "cf18b9bd-c7a3-451c-844e-84227382e471"

function Write-Info {
    param([string]$Message)
    Write-Host "[HSL] $Message" -ForegroundColor Cyan
}

# Conectar a Power BI
$pbiConnected = $false
try { $tok = Get-PowerBIAccessToken -ErrorAction Stop; if ($tok -and $tok.Authorization) { $pbiConnected = $true } } catch { }
if ($pbiConnected) {
    Write-Info "Sesion Power BI activa, reutilizando."
} else {
    Write-Info "Iniciando sesion de Power BI."
    Connect-PowerBIServiceAccount | Out-Null
}

# Auto-descubrir ReportId desde DatasetId
Write-Info "Buscando reporte para dataset $DatasetId..."
$reports = @(((Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/reports" -Method Get) | ConvertFrom-Json).value)
$match   = @($reports | Where-Object { $_.datasetId -eq $DatasetId })
if ($match.Count -eq 0) {
    throw "No se encontro ningun reporte para el dataset $DatasetId en el workspace $WorkspaceId."
}
$ReportId = $match[0].id
Write-Info "Reporte encontrado: $($match[0].name) (id: $ReportId)"

$syncScript = Join-Path $PSScriptRoot "sync-powerbi-resumen.ps1"
$syncArgs = @{
    WorkspaceId         = $WorkspaceId
    ReportId            = $ReportId
    DatasetId           = $DatasetId
    ProjectKey          = "hsl"
    ProjectName         = "Hacienda El Sol"
    MesA                = $MesA
    ModelProfile        = "clc"
    OutputDir           = "data/powerbi/hsl"
    IncludeFilterDetail = $true
    AreaFilterValues    = @("CONSTRUCCION", "URBANIZACION")
    SupabaseServiceKey  = $SupabaseServiceKey
}

if ($UploadSupabase) {
    & $syncScript @syncArgs -UploadSupabase
} else {
    & $syncScript @syncArgs
}
