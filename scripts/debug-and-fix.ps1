# Zero Risk — Debug + Fix all-in-one PowerShell script
# Reads creds from .env.local, hardcodes $env.* in all n8n workflows via PUT,
# deactivates + reactivates Cluster 1, and smoke-tests RUFLO + NEXUS webhooks.
#
# Usage:  cd zero-risk-platform; .\scripts\debug-and-fix.ps1
#
# Idempotent — safe to rerun.

$ErrorActionPreference = 'Stop'

# ── Load .env.local ──────────────────────────────────────────
$env_local = Join-Path $PSScriptRoot '..\.env.local'
if (-not (Test-Path $env_local)) { throw ".env.local not found at $env_local" }
$envMap = @{}
Get-Content $env_local | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#')) {
    $idx = $line.IndexOf('=')
    if ($idx -gt 0) {
      $k = $line.Substring(0, $idx).Trim()
      $v = $line.Substring($idx + 1).Trim().Trim('"', "'")
      $envMap[$k] = $v
    }
  }
}

$N8N_KEY = $envMap['N8N_API_KEY']
$N8N_BASE = if ($envMap['N8N_BASE_URL']) { $envMap['N8N_BASE_URL'] } else { 'https://n8n-production-72be.up.railway.app' }
$ZR_URL = 'https://zero-risk-platform.vercel.app'
$INT_KEY = $envMap['INTERNAL_API_KEY']
$MC_URL = 'https://zero-risk-mission-control-production.up.railway.app'

if (-not $N8N_KEY) { throw 'N8N_API_KEY missing in .env.local' }
if (-not $INT_KEY) { throw 'INTERNAL_API_KEY missing in .env.local' }

$hdr = @{ 'X-N8N-API-KEY' = $N8N_KEY; 'Accept' = 'application/json' }

Write-Host '🔍 Step 1: List all Zero Risk workflows' -ForegroundColor Cyan
$workflows = @()
$cursor = $null
do {
  $uri = "$N8N_BASE/api/v1/workflows?limit=100"
  if ($cursor) { $uri += "&cursor=$cursor" }
  $r = Invoke-RestMethod -Method GET -Uri $uri -Headers $hdr
  $workflows += $r.data
  $cursor = $r.nextCursor
} while ($cursor)
$zrWfs = $workflows | Where-Object { $_.name -like '*Zero Risk*' -or $_.name -like '*ZR*' }
Write-Host "   Found $($zrWfs.Count) Zero Risk workflows"

# ── Step 2: Replace $env.* in each workflow ──────────────────
Write-Host ''
Write-Host "🔧 Step 2: Replace `$env.ZERO_RISK_API_URL and `$env.INTERNAL_API_KEY with literals" -ForegroundColor Cyan
$patched = 0; $nochange = 0; $failed = 0
foreach ($wf in $zrWfs) {
  try {
    $full = Invoke-RestMethod -Method GET -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)" -Headers $hdr
    $nodesJson = $full.nodes | ConvertTo-Json -Depth 20 -Compress

    # String replacements
    $newJson = $nodesJson
    $newJson = $newJson -replace "=\{\{\s*\`$env\.ZERO_RISK_API_URL\s*\|\|\s*'https://zero-risk-platform\.vercel\.app'\s*\}\}", $ZR_URL
    $newJson = $newJson -replace "\{\{\s*\`$env\.ZERO_RISK_API_URL\s*\|\|\s*'https://zero-risk-platform\.vercel\.app'\s*\}\}", $ZR_URL
    $newJson = $newJson -replace "\{\{\s*\`$env\.ZERO_RISK_API_URL\s*\}\}", $ZR_URL
    $newJson = $newJson -replace "\{\{\s*\`$env\.INTERNAL_API_KEY\s*\}\}", $INT_KEY
    $newJson = $newJson -replace "\{\{\s*\`$env\.MC_BASE_URL\s*\}\}", $MC_URL

    if ($newJson -eq $nodesJson) {
      $nochange++
      continue
    }

    $newNodes = $newJson | ConvertFrom-Json
    $payload = @{
      name = $full.name
      nodes = $newNodes
      connections = $full.connections
      settings = if ($full.settings) { $full.settings } else { @{ executionOrder = 'v1' } }
    }
    $body = $payload | ConvertTo-Json -Depth 25 -Compress
    Invoke-RestMethod -Method PUT -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)" -Headers (@{
      'X-N8N-API-KEY' = $N8N_KEY
      'Content-Type' = 'application/json'
      'Accept' = 'application/json'
    }) -Body $body | Out-Null
    Write-Host "   ✅ $($wf.name)" -ForegroundColor Green
    $patched++
  } catch {
    Write-Host "   ❌ $($wf.name): $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}
Write-Host "   Total: $patched patched, $nochange no change, $failed failed"

# ── Step 3: Deactivate + reactivate Cluster 1 ────────────────
Write-Host ''
Write-Host '⚡ Step 3: Deactivate + reactivate Cluster 1 (force webhook re-register)' -ForegroundColor Cyan
$c1Matchers = @('NEXUS', 'RUFLO', 'HITL', 'Phase Gate', 'Meta-Agent', 'Agent Outcomes')
$c1Wfs = $zrWfs | Where-Object {
  $name = $_.name
  $match = $false
  foreach ($m in $c1Matchers) { if ($name -like "*$m*") { $match = $true; break } }
  $match
}
Write-Host "   Found $($c1Wfs.Count) Cluster 1 workflows"

foreach ($wf in $c1Wfs) {
  try {
    if ($wf.active) {
      Invoke-RestMethod -Method POST -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)/deactivate" -Headers $hdr | Out-Null
    }
  } catch { }
}
Start-Sleep -Seconds 3
foreach ($wf in $c1Wfs) {
  try {
    Invoke-RestMethod -Method POST -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)/activate" -Headers $hdr | Out-Null
    Write-Host "   ✅ Activated: $($wf.name)" -ForegroundColor Green
  } catch {
    Write-Host "   ❌ $($wf.name): $($_.Exception.Message)" -ForegroundColor Red
  }
}

# ── Step 4: Smoke test RUFLO + NEXUS ─────────────────────────
Write-Host ''
Write-Host '🧪 Step 4: Smoke test RUFLO + NEXUS' -ForegroundColor Cyan

$rufloBody = '{"client_id":"test-client","request":"analyze campaign","context_type":"general"}'
try {
  $r = Invoke-RestMethod -Method POST -Uri "$N8N_BASE/webhook/router-entry" -ContentType 'application/json' -Body $rufloBody
  Write-Host "   RUFLO: $($r.message)" -ForegroundColor Green
} catch {
  Write-Host "   RUFLO: $($_.Exception.Message)" -ForegroundColor Red
}

$nexusBody = '{"client_id":"test-client","campaign_brief":"Q2 safety helmets Ecuador","priority":"normal"}'
try {
  $r = Invoke-RestMethod -Method POST -Uri "$N8N_BASE/webhook/campaign-orchestrator" -ContentType 'application/json' -Body $nexusBody
  Write-Host "   NEXUS: $($r.message)" -ForegroundColor Green
} catch {
  Write-Host "   NEXUS: $($_.Exception.Message)" -ForegroundColor Red
}

# ── Step 5: Wait + inspect last executions ───────────────────
Write-Host ''
Write-Host '⏳ Step 5: Wait 10s + inspect latest executions' -ForegroundColor Cyan
Start-Sleep -Seconds 10

foreach ($wfName in @('RUFLO', 'NEXUS')) {
  $wf = $zrWfs | Where-Object { $_.name -like "*$wfName*" } | Select-Object -First 1
  if (-not $wf) { continue }
  try {
    $execs = Invoke-RestMethod -Method GET -Uri "$N8N_BASE/api/v1/executions?workflowId=$($wf.id)&limit=1&includeData=true" -Headers $hdr
    $exec = $execs.data[0]
    if (-not $exec) { Write-Host "   ${wfName}: no executions yet"; continue }
    $runData = $exec.data.resultData.runData
    $nodes = $runData.PSObject.Properties.Name
    $errNode = $null
    $errMsg = $null
    foreach ($n in $nodes) {
      if ($runData.$n[0].error) {
        $errNode = $n
        $errMsg = $runData.$n[0].error.message
        break
      }
    }
    $execId = $exec.id
    if ($errNode) {
      Write-Host "   $wfName exec #$execId - FAIL at '$errNode' - $errMsg" -ForegroundColor Red
    } else {
      Write-Host "   $wfName exec #$execId - OK, $($nodes.Count) nodes completed" -ForegroundColor Green
    }
  } catch {
    Write-Host "   ${wfName}: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# ── Step 6: Verify Supabase rows ─────────────────────────────
Write-Host ''
Write-Host '📊 Step 6: Check Supabase for new rows' -ForegroundColor Cyan
$zHdr = @{ 'x-api-key' = $INT_KEY }
try {
  $out = Invoke-RestMethod -Method GET -Uri "$ZR_URL/api/analytics/agent-outcomes?days=1&limit=10" -Headers $zHdr
  Write-Host "   agent_outcomes: $($out.count) records in last 24h"
  if ($out.count -gt 1) {
    Write-Host '   🎉 More than just the smoke-v6! Something landed.' -ForegroundColor Green
  }
  Write-Host "   By agent: $($out.summary.by_agent.PSObject.Properties.Name -join ', ')"
} catch {
  Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ''
Write-Host '━' * 60 -ForegroundColor DarkGray
Write-Host 'Done. If RUFLO still fails, paste output and we continue.' -ForegroundColor Cyan
