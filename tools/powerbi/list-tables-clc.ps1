$WorkspaceId = "d111fc11-b7f3-4976-b74b-99f47f06bd22"
$DatasetId   = "c6f440f9-0bef-4c32-b6d0-d0b1ffe992de"

$pbiConnected = $false
try { $tok = Get-PowerBIAccessToken -ErrorAction Stop; if ($tok -and $tok.Authorization) { $pbiConnected = $true } } catch { }
if (-not $pbiConnected) { Connect-PowerBIServiceAccount | Out-Null }

Write-Host "`n=== TABLAS via REST /tables ===" -ForegroundColor Cyan
try {
    $r = Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/datasets/$DatasetId/tables" -Method Get
    ($r | ConvertFrom-Json).value | ForEach-Object { Write-Host "  TABLA: $($_.name)" -ForegroundColor Green }
} catch {
    Write-Host "  /tables no disponible: $_" -ForegroundColor Yellow
}

Write-Host "`n=== TABLAS via DAX INFO.TABLES ===" -ForegroundColor Cyan
try {
    $body = @{ queries = @(@{ query = "EVALUATE SELECTCOLUMNS(INFO.TABLES(),""Nombre"",[Name])" }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 20
    $resp = Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/datasets/$DatasetId/executeQueries" -Method Post -ContentType "application/json" -Body $body
    ($resp | ConvertFrom-Json).results[0].tables[0].rows | ForEach-Object { Write-Host "  TABLA: $($_.'[Nombre]')" -ForegroundColor Green }
} catch {
    Write-Host "  INFO.TABLES no disponible: $_" -ForegroundColor Yellow
}

Write-Host "`n=== MEDIDAS disponibles ===" -ForegroundColor Cyan
try {
    $body2 = @{ queries = @(@{ query = "EVALUATE SELECTCOLUMNS(INFO.MEASURES(),""Tabla"",[TableID],""Nombre"",[Name])" }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 20
    $resp2 = Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/datasets/$DatasetId/executeQueries" -Method Post -ContentType "application/json" -Body $body2
    ($resp2 | ConvertFrom-Json).results[0].tables[0].rows | ForEach-Object { Write-Host "  MEDIDA: $($_.'[Nombre]')" -ForegroundColor Green }
} catch {
    Write-Host "  INFO.MEASURES no disponible" -ForegroundColor Yellow
}

Write-Host "`n=== COLUMNSTATISTICS ===" -ForegroundColor Cyan
try {
    $body3 = @{ queries = @(@{ query = "EVALUATE COLUMNSTATISTICS()" }); serializerSettings = @{ includeNulls = $true } } | ConvertTo-Json -Depth 20
    $resp3 = Invoke-PowerBIRestMethod -Url "groups/$WorkspaceId/datasets/$DatasetId/executeQueries" -Method Post -ContentType "application/json" -Body $body3
    $rows3 = ($resp3 | ConvertFrom-Json).results[0].tables[0].rows
    $rows3 | Select-Object -First 30 | ForEach-Object { Write-Host "  $($_.'[Table Name]') -> $($_.'[Column Name]')" -ForegroundColor Green }
} catch {
    Write-Host "  COLUMNSTATISTICS no disponible" -ForegroundColor Yellow
}

Write-Host "`nListo." -ForegroundColor Cyan
