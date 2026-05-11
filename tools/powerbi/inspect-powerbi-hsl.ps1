param(
    [string]$WorkspaceId = "d111fc11-b7f3-4976-b74b-99f47f06bd22",
    [string]$DatasetId   = "cf18b9bd-c7a3-451c-844e-84227382e471",
    [string]$OutputPath  = "data/powerbi/hsl/schema.json"
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[Power BI] $Message" -ForegroundColor Cyan
}

function Invoke-PowerBIDaxQuery {
    param(
        [Parameter(Mandatory=$true)][string]$WorkspaceId,
        [Parameter(Mandatory=$true)][string]$DatasetId,
        [Parameter(Mandatory=$true)][string]$Query
    )
    $body = @{ queries = @(@{ query = $Query }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 20
    $response = Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/datasets/$DatasetId/executeQueries" -Method Post -ContentType "application/json" -Body $body
    $parsed = $response | ConvertFrom-Json
    if ($parsed.results -and $parsed.results[0].tables -and $parsed.results[0].tables[0].rows) {
        return @($parsed.results[0].tables[0].rows)
    }
    return @()
}

$repoRoot        = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$resolvedOutput  = Join-Path $repoRoot $OutputPath
$outputFolder    = Split-Path -Parent $resolvedOutput
if ($outputFolder -and -not (Test-Path -LiteralPath $outputFolder)) {
    New-Item -ItemType Directory -Force -Path $outputFolder | Out-Null
}

$pbiConnected = $false
try { $tok = Get-PowerBIAccessToken -ErrorAction Stop; if ($tok -and $tok.Authorization) { $pbiConnected = $true } } catch { }
if ($pbiConnected) {
    Write-Info "Sesion Power BI activa, reutilizando."
} else {
    Write-Info "Iniciando sesion de Power BI."
    Connect-PowerBIServiceAccount | Out-Null
}

# Buscar reporte asociado al dataset
Write-Info "Buscando reporte asociado al dataset $DatasetId..."
$reports      = @(((Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/reports" -Method Get) | ConvertFrom-Json).value)
$matchReports = @($reports | Where-Object { $_.datasetId -eq $DatasetId })
if ($matchReports.Count -gt 0) {
    Write-Info "Reporte(s) encontrado(s): $(($matchReports | Select-Object -ExpandProperty name) -join ', ')"
} else {
    Write-Warning "No se encontro reporte para el dataset $DatasetId."
}

$schemaErrors = New-Object System.Collections.Generic.List[object]

function Invoke-OptionalDax {
    param([string]$Name, [string]$Query)
    try {
        Write-Info "Schema: $Name"
        return Invoke-PowerBIDaxQuery -WorkspaceId $WorkspaceId -DatasetId $DatasetId -Query $Query
    } catch {
        $schemaErrors.Add([ordered]@{ name = $Name; message = $_.Exception.Message }) | Out-Null
        return @()
    }
}

$tables   = Invoke-OptionalDax -Name "INFO.TABLES"   -Query "EVALUATE INFO.TABLES()"
$columns  = Invoke-OptionalDax -Name "INFO.COLUMNS"  -Query "EVALUATE INFO.COLUMNS()"
$measures = Invoke-OptionalDax -Name "INFO.MEASURES" -Query "EVALUATE INFO.MEASURES()"

# Probar modelo CLC (dimArea / Rubros / Calendario)
$areasCLC = Invoke-OptionalDax -Name "Areas_clc" -Query "EVALUATE SUMMARIZECOLUMNS('dimArea'[Area])"
$areasRubros = Invoke-OptionalDax -Name "Areas_rubros" -Query "EVALUATE SUMMARIZECOLUMNS('Rubros'[Area])"
$meses = Invoke-OptionalDax -Name "Meses_disponibles" -Query @"
EVALUATE SUMMARIZECOLUMNS('Calendario'[MesA])
"@
$mesaAlt = Invoke-OptionalDax -Name "Meses_alt" -Query @"
EVALUATE SUMMARIZECOLUMNS('dimCalendario'[MesA])
"@

# Intentar leer pages del reporte si existe
$pages = @()
if ($matchReports.Count -gt 0) {
    $reportId = $matchReports[0].id
    try {
        Write-Info "Leyendo paginas del reporte $reportId..."
        $pagesResp = (Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/reports/$reportId/pages" -Method Get) | ConvertFrom-Json
        $pages = @($pagesResp.value)
        Write-Info "Paginas: $(($pages | Select-Object -ExpandProperty displayName) -join ', ')"
    } catch {
        Write-Warning "No se pudieron leer paginas: $_"
    }
}

$schema = @{
    datasetId    = $DatasetId
    workspaceId  = $WorkspaceId
    reports      = @($matchReports)
    pages        = @($pages)
    tables       = @($tables)
    columns      = @($columns)
    measures     = @($measures)
    areas_clc    = @($areasCLC)
    areas_rubros = @($areasRubros)
    meses        = @($meses)
    meses_alt    = @($mesaAlt)
    errors       = @($schemaErrors.ToArray())
}

$json      = $schema | ConvertTo-Json -Depth 100
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($resolvedOutput, $json, $utf8NoBom)
Write-Info "Schema exportado: $resolvedOutput"
Write-Info ""
Write-Info "=== RESUMEN ==="
Write-Info "Reportes encontrados: $($matchReports.Count)"
if ($matchReports.Count -gt 0) {
    $matchReports | ForEach-Object { Write-Info "  - $($_.name) (id: $($_.id))" }
}
Write-Info "Paginas del reporte: $($pages.Count)"
if ($pages.Count -gt 0) {
    $pages | ForEach-Object { Write-Info "  - $($_.displayName) (name: $($_.name))" }
}
Write-Info "Tablas en el modelo: $($tables.Count)"
Write-Info "Columnas en el modelo: $($columns.Count)"
Write-Info "Meses disponibles (Calendario): $($meses.Count)"
Write-Info "Meses disponibles (dimCalendario): $($mesaAlt.Count)"
