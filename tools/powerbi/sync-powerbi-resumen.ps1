param(
    [string]$WorkspaceId = "d111fc11-b7f3-4976-b74b-99f47f06bd22",
    [string]$ReportId = "f3fdef8d-947a-4e1a-9188-c774420fde9c",
    [string]$ReportName = "",
    [switch]$IncludeFilterDetail,
    [string]$DatasetId = "",
    [string]$ProjectKey = "bse",
    [string]$ProjectName = "Bosques de Santa Elena",
    [string]$MesA = "abr 26",
    [string]$ModelProfile = "bse",
    [string[]]$AreaFilterValues = @(),
    [string]$OutputDir = "data/powerbi",
    [switch]$UploadSupabase,
    [string]$SupabaseUrl = "https://iipgrojliqeyycvgnkrc.supabase.co",
    [string]$SupabaseServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[Power BI] $Message" -ForegroundColor Cyan
}

function ConvertTo-Utf8JsonFile {
    param(
        [Parameter(Mandatory = $true)]$InputObject,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $json = $InputObject | ConvertTo-Json -Depth 100
    $folder = Split-Path -Parent $Path
    if ($folder -and -not (Test-Path -LiteralPath $folder)) {
        New-Item -ItemType Directory -Force -Path $folder | Out-Null
    }
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $folder).Path + "\" + (Split-Path -Leaf $Path), $json, $utf8NoBom)
}

function ConvertTo-DaxIdentifier {
    param(
        [Parameter(Mandatory = $true)][string]$TableName,
        [Parameter(Mandatory = $true)][string]$ObjectName
    )

    $safeTable = $TableName.Replace("'", "''")
    $safeObject = $ObjectName.Replace("]", "]]")
    return "'$safeTable'[$safeObject]"
}

function ConvertTo-DaxStringLiteral {
    param([Parameter(Mandatory = $true)][string]$Value)
    return '"' + $Value.Replace('"', '""') + '"'
}

function Invoke-PowerBIDaxQuery {
    param(
        [Parameter(Mandatory = $true)][string]$WorkspaceId,
        [Parameter(Mandatory = $true)][string]$DatasetId,
        [Parameter(Mandatory = $true)][string]$Query,
        [Parameter(Mandatory = $true)][string]$Name
    )

    Write-Info "Ejecutando consulta: $Name"
    $body = @{
        queries = @(
            @{
                query = $Query
            }
        )
        serializerSettings = @{
            includeNulls = $true
        }
    } | ConvertTo-Json -Depth 20

    $response = Invoke-PowerBIRestMethod `
        -Url "groups/$WorkspaceId/datasets/$DatasetId/executeQueries" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body

    $parsed = $response | ConvertFrom-Json
    $rows = @()
    if ($parsed.results -and $parsed.results[0].tables -and $parsed.results[0].tables[0].rows) {
        $rows = @($parsed.results[0].tables[0].rows)
    }

    return @{
        name = $Name
        query = $Query
        rows = $rows
        raw = $parsed
    }
}

function Get-ErrorText {
    param([Parameter(Mandatory = $true)]$ErrorRecord)

    $parts = New-Object System.Collections.Generic.List[string]
    $parts.Add($ErrorRecord.Exception.Message)

    if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
        $parts.Add($ErrorRecord.ErrorDetails.Message)
    }

    $exception = $ErrorRecord.Exception
    while ($exception.InnerException) {
        $exception = $exception.InnerException
        $parts.Add($exception.Message)
    }

    $parts.Add(($ErrorRecord | Format-List * -Force | Out-String))
    return ($parts | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join "`n"
}

function Resolve-PowerBIReportByName {
    param(
        [Parameter(Mandatory = $true)][string]$WorkspaceId,
        [Parameter(Mandatory = $true)][string]$ReportName
    )

    Write-Info "Buscando reporte por nombre: $ReportName"
    $reportsResponse = Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/reports" -Method Get
    $reports = @((($reportsResponse | ConvertFrom-Json).value))
    $reportMatches = @($reports | Where-Object { $_.name -eq $ReportName })

    if ($reportMatches.Count -eq 0) {
        $available = ($reports | Select-Object -ExpandProperty name) -join ", "
        throw "No se encontro el reporte '$ReportName' en el workspace. Reportes disponibles: $available"
    }

    if ($reportMatches.Count -gt 1) {
        throw "Se encontro mas de un reporte con el nombre '$ReportName'. Pasa -ReportId para evitar ambiguedad."
    }

    return $reportMatches[0]
}

function Publish-SupabaseResumen {
    param(
        [Parameter(Mandatory = $true)]$Payload,
        [Parameter(Mandatory = $true)][string]$SupabaseUrl,
        [Parameter(Mandatory = $true)][string]$SupabaseServiceKey,
        [Parameter(Mandatory = $true)][string]$ProjectKey,
        [Parameter(Mandatory = $true)][string]$ProjectName,
        [Parameter(Mandatory = $true)][string]$MesA,
        [Parameter(Mandatory = $true)][string]$WorkspaceId,
        [Parameter(Mandatory = $true)][string]$ReportId,
        [Parameter(Mandatory = $true)][string]$DatasetId
    )

    if ([string]::IsNullOrWhiteSpace($SupabaseServiceKey)) {
        throw "Falta SUPABASE_SERVICE_ROLE_KEY. Define la variable de entorno o pasa -SupabaseServiceKey."
    }

    $row = @(
        [ordered]@{
            project_key = $ProjectKey
            project_name = $ProjectName
            mes_a = $MesA
            generated_at = $Payload.metadata.generatedAt
            workspace_id = $WorkspaceId
            report_id = $ReportId
            dataset_id = $DatasetId
            source = "Power BI Service"
            payload = $Payload
            updated_at = (Get-Date).ToUniversalTime().ToString("o")
        }
    )

    $headers = @{
        apikey        = $SupabaseServiceKey
        Authorization = "Bearer $SupabaseServiceKey"
    }

    # DELETE existing row first to guarantee clean replacement
    $deleteUri = "$SupabaseUrl/rest/v1/powerbi_resumen_cache?project_key=eq.$ProjectKey"
    Invoke-RestMethod -Uri $deleteUri -Method Delete -Headers $headers | Out-Null

    # INSERT fresh row
    $insertHeaders = $headers + @{ Prefer = "return=minimal" }
    $body = $row | ConvertTo-Json -Depth 100 -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/powerbi_resumen_cache" -Method Post -Headers $insertHeaders -ContentType "application/json; charset=utf-8" -Body $bodyBytes | Out-Null
}

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$outputPath = Join-Path $repoRoot $OutputDir
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$pbiConnected = $false
try {
    $tok = Get-PowerBIAccessToken -ErrorAction Stop
    if ($tok -and $tok.Authorization) { $pbiConnected = $true }
} catch { }

if ($pbiConnected) {
    Write-Info "Sesion Power BI activa, reutilizando."
} else {
    Write-Info "Iniciando sesion. Usa tu cuenta de Microsoft con acceso al reporte."
    Connect-PowerBIServiceAccount | Out-Null
}
$env:PBI_SESSION_ACTIVE = "1"

if (-not [string]::IsNullOrWhiteSpace($ReportName)) {
    $resolvedReport = Resolve-PowerBIReportByName -WorkspaceId $WorkspaceId -ReportName $ReportName
    $ReportId = $resolvedReport.id
    if ([string]::IsNullOrWhiteSpace($DatasetId)) {
        $DatasetId = $resolvedReport.datasetId
    }
}

if ([string]::IsNullOrWhiteSpace($ReportId)) {
    throw "Falta ReportId. Pasa -ReportId o -ReportName."
}

if ([string]::IsNullOrWhiteSpace($DatasetId)) {
    Write-Info "Resolviendo dataset desde el reporte $ReportId"
    $reportResponse = Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/reports/$ReportId" -Method Get
    $report = $reportResponse | ConvertFrom-Json
    $DatasetId = $report.datasetId
}

if ([string]::IsNullOrWhiteSpace($DatasetId)) {
    throw "No se pudo resolver el DatasetId. Ejecuta el script pasando -DatasetId."
}

Write-Info "WorkspaceId: $WorkspaceId"
Write-Info "ReportId: $ReportId"
Write-Info "DatasetId: $DatasetId"

$metadata = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    workspaceId = $WorkspaceId
    reportId = $ReportId
    datasetId = $DatasetId
    projectKey = $ProjectKey
    projectName = $ProjectName
    modelProfile = $ModelProfile
    filters = [ordered]@{
        areas = @("Construccion", "Urbanizacion")
        mesA = $MesA
    }
    source = "Power BI Service"
}

if ($ModelProfile -eq "clc") {
    $accentUpperO = [char]0x00d3

    # Auto-detect dimension table by probing candidate names
    $dimTableName = $null
    $o = [char]0x00f3  # ó
    $candidates = @(
        "Rubros","Actividades","Partidas","Segmentacion","Rubro",
        "Segmentaci$($o)n","dimSegmentaci$($o)n","dimSegmentacion",
        "Presupuesto","Detalle","Detalles","Renglones","Renglon","Rengl$($o)n",
        "Partida","Obras","Elementos","Componentes","Tareas","Conceptos",
        "Items","Categoria","Categorias","dimActividades","dimRubros",
        "PresupuestoDetalle","BudgetItems","Budget","Lineas","Subactividades",
        "Segmento","Segmentos","dimPartidas","dimConceptos","dimElementos",
        "Trabajo","Trabajos","Renglon Presupuestario","Renglones Presupuestarios"
    )
    foreach ($c in $candidates) {
        try {
            $safe = $c.Replace("'","''")
            $bPrb = @{ queries = @(@{ query = "EVALUATE TOPN(1, '$safe')" }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 20
            Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/datasets/$DatasetId/executeQueries" -Method Post -ContentType "application/json" -Body $bPrb | Out-Null
            $dimTableName = $c
            Write-Info "Tabla de dimension encontrada: $dimTableName"
            break
        } catch { }
    }
    if (-not $dimTableName) {
        # Last resort: try to find table via Area column query
        $areaVariants = @("Area","$(([char]0x00c1))rea","area","AREA")
        foreach ($av in $areaVariants) {
            try {
                $bAv = @{ queries = @(@{ query = "EVALUATE SUMMARIZECOLUMNS(BLANK(),BLANK(),""t"",COALESCE(MAXX(ALL('Medidas'),""x""),""""))" }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 20
            } catch { }
        }
        throw "No se pudo detectar tabla de dimension. Candidatos probados: $($candidates -join ', '). Verifica el nombre de la tabla en Power BI Desktop."
    }

    $areaColumnDax           = ConvertTo-DaxIdentifier -TableName $dimTableName -ObjectName "Area"
    $segmentoColumnDax       = ConvertTo-DaxIdentifier -TableName $dimTableName -ObjectName "Segmento"
    $etapaColumnDax          = ConvertTo-DaxIdentifier -TableName $dimTableName -ObjectName "Etapa"
    $faseColumnDax           = ConvertTo-DaxIdentifier -TableName $dimTableName -ObjectName "Fase"
    $monthColumnDax          = ConvertTo-DaxIdentifier -TableName "Calendario" -ObjectName "MesA"

    $presupuestoRdiMeasure   = "Presupuesto Seg" + [char]0x00fa + "n RDI"
    $rdiMeasureDax           = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName $presupuestoRdiMeasure
    $pptoErMeasureDax        = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName $presupuestoRdiMeasure
    $ejecutadoMeasureDax     = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Ejecutado"
    $comprometidoMeasureDax  = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Comprometido"
    $asignadoMeasureDax      = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Asignado"
    $disponibleMeasureDax    = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Disponible"
    $pctAsignadoMeasureDax   = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "% Asignado"
    $pctDisponibleMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "% Disponible"

    if ($AreaFilterValues.Count -eq 0) {
        $AreaFilterValues = @(("CONSTRUCCI" + $accentUpperO + "N"), ("URBANIZACI" + $accentUpperO + "N"))
    }
} elseif ($ModelProfile -eq "hlq") {
    $accentO = [char]0x00f3
    $accentU = [char]0x00fa
    $accentUpperO = [char]0x00d3
    $segmentacionTable = "dimSegmentaci" + $accentO + "n"
    $presupuestoRdiMeasure = "Presupuesto Seg" + $accentU + "n RDI"

    $areaColumnDax = ConvertTo-DaxIdentifier -TableName $segmentacionTable -ObjectName "Area"
    $segmentoColumnDax = ConvertTo-DaxIdentifier -TableName $segmentacionTable -ObjectName "Segmento"
    $etapaColumnDax = ConvertTo-DaxIdentifier -TableName $segmentacionTable -ObjectName "Etapa"
    $faseColumnDax = ConvertTo-DaxIdentifier -TableName "dimFase" -ObjectName "Fase"
    $monthColumnDax = ConvertTo-DaxIdentifier -TableName "Calendario" -ObjectName "MesA"

    $rdiMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName $presupuestoRdiMeasure
    $pptoErMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName $presupuestoRdiMeasure
    $ejecutadoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Ejecutado"
    $comprometidoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Comprometido"
    $asignadoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Asignado"
    $disponibleMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Disponible"
    $pctAsignadoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "% Asignado"
    $pctDisponibleMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "% Disponible"

    if ($AreaFilterValues.Count -eq 0) {
        $AreaFilterValues = @(("CONSTRUCCI" + $accentUpperO + "N"), "FUERA DE PROYECTO", ("URBANIZACI" + $accentUpperO + "N"))
    }
} else {
    $areaColumnDax = ConvertTo-DaxIdentifier -TableName "Rubros" -ObjectName "Area"
    $segmentoColumnDax = ConvertTo-DaxIdentifier -TableName "Rubros" -ObjectName "Segmento"
    $etapaColumnDax = ConvertTo-DaxIdentifier -TableName "Rubros" -ObjectName "Etapa"
    $faseColumnDax = ConvertTo-DaxIdentifier -TableName "Rubros" -ObjectName "Fase"
    $monthColumnDax = ConvertTo-DaxIdentifier -TableName "Calendario" -ObjectName "MesA"

    $rdiMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "RDI Total"
    $pptoErMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Presupuesto Erequester"
    $ejecutadoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Ejecutado Erequester"
    $comprometidoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Comprometido Erequester"
    $asignadoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Asignado Erequester"
    $disponibleMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "Disponible Erequester"
    $pctAsignadoMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "% Asignado"
    $pctDisponibleMeasureDax = ConvertTo-DaxIdentifier -TableName "Medidas" -ObjectName "% Disponible"

    if ($AreaFilterValues.Count -eq 0) {
        $accentO = [char]0x00f3
        $AreaFilterValues = @(("Construcci" + $accentO + "n"), ("Urbanizaci" + $accentO + "n"))
    }
}

$areaFilterListDax = ($AreaFilterValues | ForEach-Object { ConvertTo-DaxStringLiteral $_ }) -join ", "
$areaFilterDax = "TREATAS({$areaFilterListDax}, $areaColumnDax)"
$monthFilterDax = "TREATAS({$(ConvertTo-DaxStringLiteral $MesA)}, $monthColumnDax)"
$mainFilterDax = if ($ModelProfile -eq "hlq") { "" } else { "$monthFilterDax," }
$metadata.filters.areas = @($AreaFilterValues)

$queries = [ordered]@{
    totales = @"
EVALUATE
SUMMARIZECOLUMNS(
    $areaFilterDax,
    $mainFilterDax
    "RdiTotal", $rdiMeasureDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax,
    "PorcentajeAsignado", $pctAsignadoMeasureDax,
    "PorcentajeDisponible", $pctDisponibleMeasureDax
)
"@
    porArea = @"
EVALUATE
SUMMARIZECOLUMNS(
    $areaColumnDax,
    $areaFilterDax,
    $mainFilterDax
    "RdiTotal", $rdiMeasureDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax,
    "PorcentajeAsignado", $pctAsignadoMeasureDax,
    "PorcentajeDisponible", $pctDisponibleMeasureDax
)
ORDER BY $areaColumnDax
"@
    porEtapa = @"
EVALUATE
SUMMARIZECOLUMNS(
    $etapaColumnDax,
    $areaFilterDax,
    $mainFilterDax
    "RdiTotal", $rdiMeasureDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax,
    "PorcentajeAsignado", $pctAsignadoMeasureDax,
    "PorcentajeDisponible", $pctDisponibleMeasureDax
)
ORDER BY $etapaColumnDax
"@
    porSegmento = @"
EVALUATE
SUMMARIZECOLUMNS(
    $segmentoColumnDax,
    $areaFilterDax,
    $mainFilterDax
    "RdiTotal", $rdiMeasureDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax,
    "PorcentajeAsignado", $pctAsignadoMeasureDax,
    "PorcentajeDisponible", $pctDisponibleMeasureDax
)
ORDER BY $segmentoColumnDax
"@
    porMes = @"
EVALUATE
SUMMARIZECOLUMNS(
    $monthColumnDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax
)
ORDER BY $monthColumnDax
"@
    porMesResumen = @"
EVALUATE
SUMMARIZECOLUMNS(
    $monthColumnDax,
    $areaFilterDax,
    "RdiTotal", $rdiMeasureDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax,
    "PorcentajeAsignado", $pctAsignadoMeasureDax,
    "PorcentajeDisponible", $pctDisponibleMeasureDax
)
ORDER BY $monthColumnDax
"@
}

if ($IncludeFilterDetail) {
    # bse model: Rubros[Fase] does not exist — skip porFase and omit it from detalleFiltros
    $hasFaseColumn = ($ModelProfile -ne "bse")

    if ($hasFaseColumn) {
        $queries.porFase = @"
EVALUATE
SUMMARIZECOLUMNS(
    $faseColumnDax,
    $areaFilterDax,
    $mainFilterDax
    "RdiTotal", $rdiMeasureDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax,
    "PorcentajeAsignado", $pctAsignadoMeasureDax,
    "PorcentajeDisponible", $pctDisponibleMeasureDax
)
ORDER BY $faseColumnDax
"@
    }

    $faseDaxLine  = if ($hasFaseColumn) { "    $faseColumnDax,`n" } else { "" }
    $faseOrderDax = if ($hasFaseColumn) { ", $faseColumnDax" } else { "" }

    # porMesFiltros: all months x area (no month filter) — for tendencia chart
    $queries.porMesFiltros = @"
EVALUATE
SUMMARIZECOLUMNS(
    $monthColumnDax,
    $areaColumnDax,
    $areaFilterDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax
)
ORDER BY $monthColumnDax, $areaColumnDax
"@

    $queries.detalleFiltros = @"
EVALUATE
SUMMARIZECOLUMNS(
    $monthColumnDax,
    $areaColumnDax,
    $segmentoColumnDax,
    $etapaColumnDax,
$($faseDaxLine)    $areaFilterDax,
    $mainFilterDax
    "RdiTotal", $rdiMeasureDax,
    "PresupuestoErequester", $pptoErMeasureDax,
    "EjecutadoErequester", $ejecutadoMeasureDax,
    "ComprometidoErequester", $comprometidoMeasureDax,
    "AsignadoErequester", $asignadoMeasureDax,
    "DisponibleErequester", $disponibleMeasureDax,
    "PorcentajeAsignado", $pctAsignadoMeasureDax,
    "PorcentajeDisponible", $pctDisponibleMeasureDax
)
ORDER BY $monthColumnDax, $areaColumnDax, $segmentoColumnDax, $etapaColumnDax$faseOrderDax
"@
}

$results = [ordered]@{
    metadata = $metadata
    datasets = [ordered]@{}
    errors = @()
}

foreach ($entry in $queries.GetEnumerator()) {
    try {
        $queryResult = Invoke-PowerBIDaxQuery -WorkspaceId $WorkspaceId -DatasetId $DatasetId -Query $entry.Value -Name $entry.Key
        $results.datasets[$entry.Key] = $queryResult.rows
        ConvertTo-Utf8JsonFile -InputObject @{
            metadata = $metadata
            name = $entry.Key
            rows = $queryResult.rows
        } -Path (Join-Path $outputPath "$($entry.Key).json")
    }
    catch {
        $message = Get-ErrorText -ErrorRecord $_
        $results.errors += @{
            name = $entry.Key
            message = $message
        }
        Write-Host "[Power BI] Error en $($entry.Key): $message" -ForegroundColor Yellow
    }
}

ConvertTo-Utf8JsonFile -InputObject $results -Path (Join-Path $outputPath "resumen-powerbi.json")
Write-Info "Exportacion finalizada: $outputPath"

if ($UploadSupabase) {
    Write-Info "Subiendo resumen a Supabase: $ProjectKey"
    Publish-SupabaseResumen `
        -Payload $results `
        -SupabaseUrl $SupabaseUrl `
        -SupabaseServiceKey $SupabaseServiceKey `
        -ProjectKey $ProjectKey `
        -ProjectName $ProjectName `
        -MesA $MesA `
        -WorkspaceId $WorkspaceId `
        -ReportId $ReportId `
        -DatasetId $DatasetId
    Write-Info "Supabase actualizado correctamente."
}
