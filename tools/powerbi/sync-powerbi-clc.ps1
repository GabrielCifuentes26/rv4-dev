param(
    [string]$MesA = "abr 26",
    [switch]$UploadSupabase,
    [string]$SupabaseServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"

$syncScript = Join-Path $PSScriptRoot "sync-powerbi-resumen.ps1"
$syncArgs = @{
    ReportName  = "DashboardPresupuesto_CLC"
    DatasetId   = "c6f440f9-0bef-4c32-b6d0-d0b1ffe992de"
    ProjectKey  = "clc"
    ProjectName = "Condado La Ceiba"
    MesA        = $MesA
    ModelProfile        = "hlq"
    OutputDir           = "data/powerbi/clc"
    IncludeFilterDetail = $true
    AreaFilterValues    = @(("CONSTRUCCI" + [char]0x00d3 + "N"), ("URBANIZACI" + [char]0x00d3 + "N"))
    SupabaseServiceKey  = $SupabaseServiceKey
}

if ($UploadSupabase) {
    & $syncScript @syncArgs -UploadSupabase
} else {
    & $syncScript @syncArgs
}
