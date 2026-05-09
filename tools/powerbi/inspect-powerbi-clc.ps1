param(
    [string]$WorkspaceId = "d111fc11-b7f3-4976-b74b-99f47f06bd22",
    [string]$DatasetId   = "c6f440f9-0bef-4c32-b6d0-d0b1ffe992de",
    [string]$OutputPath  = "data/powerbi/clc/schema.json"
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

# Buscar reporte que usa este dataset
Write-Info "Buscando reporte asociado al dataset $DatasetId..."
$reports      = @(((Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/reports" -Method Get) | ConvertFrom-Json).value)
$matchReports = @($reports | Where-Object { $_.datasetId -eq $DatasetId })
if ($matchReports.Count -gt 0) {
    Write-Info "Reporte(s) encontrado(s): $(($matchReports | Select-Object -ExpandProperty name) -join ', ')"
} else {
    Write-Warning "No se encontro reporte para el dataset $DatasetId. Inspeccionando dataset directo."
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

# Intentar leer areas disponibles (modelo hlq: dimSegmentacion)
$areasHlq = Invoke-OptionalDax -Name "Areas_hlq" -Query @"
EVALUATE SUMMARIZECOLUMNS(
    'dimSegmentaci$(([char]0x00f3))n'[Area]
)
"@

# Intentar leer areas disponibles (modelo bse: Rubros)
$areasBse = Invoke-OptionalDax -Name "Areas_bse" -Query "EVALUATE SUMMARIZECOLUMNS('Rubros'[Area])"

$schema = @{
    datasetId    = $DatasetId
    reports      = @($matchReports)
    tables       = @($tables)
    columns      = @($columns)
    measures     = @($measures)
    areas_hlq    = @($areasHlq)
    areas_bse    = @($areasBse)
    errors       = @($schemaErrors.ToArray())
}

$json      = $schema | ConvertTo-Json -Depth 100
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($resolvedOutput, $json, $utf8NoBom)
Write-Info "Schema exportado: $resolvedOutput"
