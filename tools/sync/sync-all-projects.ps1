param(
    [string]$SupabaseServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"

$powerbIDir = Join-Path $PSScriptRoot "..\powerbi"

$monthNames = @("ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic")
$now        = Get-Date
$mesA       = "$($monthNames[$now.Month - 1]) $($now.ToString('yy'))"
$timestamp  = $now.ToString("dd/MM/yyyy HH:mm")

function Send-SyncEmail {
    param([string]$Subject, [string]$HtmlBody)
    try {
        $ol   = New-Object -ComObject Outlook.Application -ErrorAction Stop
        $mail = $ol.CreateItem(0)
        $mail.To       = "gcifuentes@rvcuatro.com"
        $mail.Subject  = $Subject
        $mail.HTMLBody = $HtmlBody
        $mail.Send()
    } catch {
        Write-Warning "[RV4] No se pudo enviar email via Outlook: $_"
    }
}

$completed = [System.Collections.Generic.List[string]]::new()
$errors    = [System.Collections.Generic.List[string]]::new()

# ── BSE ──────────────────────────────────────────────────────────────────────
try {
    Write-Host "[RV4] Sincronizando BSE ($mesA)..." -ForegroundColor Cyan
    & (Join-Path $powerbIDir "sync-powerbi-bse.ps1") `
        -MesA              $mesA `
        -UploadSupabase `
        -SupabaseServiceKey $SupabaseServiceKey
    $completed.Add("BSE — Bosques de Santa Elena")
    Write-Host "[RV4] BSE completado." -ForegroundColor Green
} catch {
    $errors.Add("BSE: $($_.Exception.Message)")
    Write-Warning "[RV4] Error BSE: $_"
}

# ── BDJ ──────────────────────────────────────────────────────────────────────
try {
    Write-Host "[RV4] Sincronizando BDJ ($mesA)..." -ForegroundColor Cyan
    & (Join-Path $powerbIDir "sync-powerbi-bdj.ps1") `
        -MesA              $mesA `
        -UploadSupabase `
        -SupabaseServiceKey $SupabaseServiceKey
    $completed.Add("BDJ — Bosques de Jalapa")
    Write-Host "[RV4] BDJ completado." -ForegroundColor Green
} catch {
    $errors.Add("BDJ: $($_.Exception.Message)")
    Write-Warning "[RV4] Error BDJ: $_"
}

# ── BDP ──────────────────────────────────────────────────────────────────────
try {
    Write-Host "[RV4] Sincronizando BDP ($mesA)..." -ForegroundColor Cyan
    & (Join-Path $powerbIDir "sync-powerbi-bdp.ps1") `
        -MesA              $mesA `
        -UploadSupabase `
        -SupabaseServiceKey $SupabaseServiceKey
    $completed.Add("BDP — Bosques de Pinula")
    Write-Host "[RV4] BDP completado." -ForegroundColor Green
} catch {
    $errors.Add("BDP: $($_.Exception.Message)")
    Write-Warning "[RV4] Error BDP: $_"
}

# ── CSE ──────────────────────────────────────────────────────────────────────
try {
    Write-Host "[RV4] Sincronizando CSE ($mesA)..." -ForegroundColor Cyan
    & (Join-Path $powerbIDir "sync-powerbi-cse.ps1") `
        -MesA              $mesA `
        -UploadSupabase `
        -SupabaseServiceKey $SupabaseServiceKey
    $completed.Add("CSE — Condado Santa Elena")
    Write-Host "[RV4] CSE completado." -ForegroundColor Green
} catch {
    $errors.Add("CSE: $($_.Exception.Message)")
    Write-Warning "[RV4] Error CSE: $_"
}

# ── RDB ──────────────────────────────────────────────────────────────────────
try {
    Write-Host "[RV4] Sincronizando RDB ($mesA)..." -ForegroundColor Cyan
    & (Join-Path $powerbIDir "sync-powerbi-rdb.ps1") `
        -MesA              $mesA `
        -UploadSupabase `
        -SupabaseServiceKey $SupabaseServiceKey
    $completed.Add("RDB — Residencias Del Bosque")
    Write-Host "[RV4] RDB completado." -ForegroundColor Green
} catch {
    $errors.Add("RDB: $($_.Exception.Message)")
    Write-Warning "[RV4] Error RDB: $_"
}

# ── HLQ ──────────────────────────────────────────────────────────────────────
try {
    Write-Host "[RV4] Sincronizando HLQ ($mesA)..." -ForegroundColor Cyan
    & (Join-Path $powerbIDir "sync-powerbi-hlq.ps1") `
        -MesA              $mesA `
        -UploadSupabase `
        -SupabaseServiceKey $SupabaseServiceKey
    $completed.Add("HLQ — Hacienda La Querencia")
    Write-Host "[RV4] HLQ completado." -ForegroundColor Green
} catch {
    $errors.Add("HLQ: $($_.Exception.Message)")
    Write-Warning "[RV4] Error HLQ: $_"
}

# ── CLC ──────────────────────────────────────────────────────────────────────
try {
    Write-Host "[RV4] Sincronizando CLC ($mesA)..." -ForegroundColor Cyan
    & (Join-Path $powerbIDir "sync-powerbi-clc.ps1") `
        -MesA              $mesA `
        -UploadSupabase `
        -SupabaseServiceKey $SupabaseServiceKey
    $completed.Add("CLC — Condado La Ceiba")
    Write-Host "[RV4] CLC completado." -ForegroundColor Green
} catch {
    $errors.Add("CLC: $($_.Exception.Message)")
    Write-Warning "[RV4] Error CLC: $_"
}

# ── EMAIL ─────────────────────────────────────────────────────────────────────
$liCompleted = ($completed | ForEach-Object { "<li>&#10003; $_</li>" }) -join ""
$liErrors    = ($errors    | ForEach-Object { "<li style='color:#c0392b'>&#10007; $_</li>" }) -join ""

if ($errors.Count -eq 0) {
    $subject = "[RV4] Dashboards actualizados — $timestamp"
    $body = @"
<p style="font-family:Segoe UI,sans-serif">
  La sincronizacion con Power BI completo correctamente.<br><br>
  <strong>Proyectos actualizados:</strong>
  <ul>$liCompleted</ul>
  <span style="color:#888;font-size:11px">Mes: $mesA &nbsp;|&nbsp; $timestamp</span>
</p>
"@
} else {
    $subject = "[RV4] Error en sincronizacion Power BI — $timestamp"
    $body = @"
<p style="font-family:Segoe UI,sans-serif">
  La sincronizacion encontro errores:<br><br>
  <ul>$liErrors</ul>
  $(if ($completed.Count -gt 0) { "<strong>Completados:</strong><ul>$liCompleted</ul>" })
  <span style="color:#888;font-size:11px">Mes: $mesA &nbsp;|&nbsp; $timestamp</span>
</p>
"@
}

Send-SyncEmail -Subject $subject -HtmlBody $body

if ($errors.Count -gt 0) {
    throw "Sincronizacion con $($errors.Count) error(es): $($errors -join '; ')"
}

Write-Host "[RV4] Todo listo. Mes: $mesA" -ForegroundColor Green
