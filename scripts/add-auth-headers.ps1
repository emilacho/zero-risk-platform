# Zero Risk — Add x-api-key header to all n8n HTTP nodes calling Vercel API
#
# The research-generated workflows have HTTP nodes that call zero-risk-platform.vercel.app
# but many lack sendHeaders: true + headerParameters with x-api-key.
# This causes "Authorization failed" errors.
#
# This script fetches every Zero Risk workflow, finds all httpRequest nodes
# calling the Vercel API, and injects the x-api-key header.

$ErrorActionPreference = 'Stop'

$env_local = Join-Path $PSScriptRoot '..\.env.local'
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
$INT_KEY = $envMap['INTERNAL_API_KEY']
$hdr = @{ 'X-N8N-API-KEY' = $N8N_KEY; 'Accept' = 'application/json' }

Write-Host 'Listing workflows...' -ForegroundColor Cyan
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
Write-Host "Found $($zrWfs.Count) Zero Risk workflows"

$patchedWfs = 0
$patchedNodes = 0
$failed = 0

foreach ($wf in $zrWfs) {
  try {
    $full = Invoke-RestMethod -Method GET -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)" -Headers $hdr
    $anyChange = $false
    $localPatched = 0

    foreach ($node in $full.nodes) {
      if ($node.type -ne 'n8n-nodes-base.httpRequest') { continue }
      $url = $node.parameters.url
      if (-not $url) { continue }
      # Only patch nodes calling Vercel API (not PostHog, not Slack, not external APIs)
      if ($url -notlike '*zero-risk-platform.vercel.app*' -and $url -notlike '*vercel.app*') { continue }

      # Check if already has x-api-key header
      $existing = @()
      if ($node.parameters.headerParameters -and $node.parameters.headerParameters.parameters) {
        $existing = $node.parameters.headerParameters.parameters
      }
      $hasApiKey = $false
      foreach ($h in $existing) {
        if ($h.name -eq 'x-api-key') { $hasApiKey = $true; break }
      }
      if ($hasApiKey) { continue }

      # Inject the header
      $newHeader = @{ name = 'x-api-key'; value = $INT_KEY }
      $ctHeader = $null
      foreach ($h in $existing) {
        if ($h.name -eq 'Content-Type') { $ctHeader = $h; break }
      }
      $paramsArr = @()
      if (-not $ctHeader) {
        $paramsArr += @{ name = 'Content-Type'; value = 'application/json' }
      }
      foreach ($h in $existing) { $paramsArr += $h }
      $paramsArr += $newHeader

      if (-not $node.parameters.PSObject.Properties['sendHeaders']) {
        $node.parameters | Add-Member -NotePropertyName 'sendHeaders' -NotePropertyValue $true -Force
      } else {
        $node.parameters.sendHeaders = $true
      }
      if (-not $node.parameters.PSObject.Properties['headerParameters']) {
        $node.parameters | Add-Member -NotePropertyName 'headerParameters' -NotePropertyValue (@{ parameters = $paramsArr }) -Force
      } else {
        $node.parameters.headerParameters = @{ parameters = $paramsArr }
      }

      $anyChange = $true
      $localPatched++
    }

    if (-not $anyChange) { continue }

    # PUT back
    $payload = @{
      name = $full.name
      nodes = $full.nodes
      connections = $full.connections
      settings = if ($full.settings) { $full.settings } else { @{ executionOrder = 'v1' } }
    }
    $body = $payload | ConvertTo-Json -Depth 30 -Compress
    Invoke-RestMethod -Method PUT -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)" -Headers @{
      'X-N8N-API-KEY' = $N8N_KEY
      'Content-Type' = 'application/json'
      'Accept' = 'application/json'
    } -Body $body | Out-Null

    Write-Host "  [OK] $($wf.name) (+$localPatched headers)" -ForegroundColor Green
    $patchedWfs++
    $patchedNodes += $localPatched
  } catch {
    Write-Host "  [FAIL] $($wf.name): $($_.Exception.Message)" -ForegroundColor Red
    $failed++
  }
}

Write-Host ''
Write-Host "Summary: $patchedWfs workflows patched, $patchedNodes nodes got x-api-key header, $failed failed" -ForegroundColor Cyan

# Now deactivate + reactivate Cluster 1 to re-register
Write-Host ''
Write-Host 'Deactivating + reactivating Cluster 1 workflows...' -ForegroundColor Cyan
$c1Names = @('NEXUS', 'RUFLO', 'HITL', 'Phase Gate', 'Meta-Agent', 'Agent Outcomes')
$c1Wfs = $zrWfs | Where-Object {
  $n = $_.name
  $match = $false
  foreach ($m in $c1Names) { if ($n -like "*$m*") { $match = $true; break } }
  $match
}

$actHdr = @{
  'X-N8N-API-KEY' = $N8N_KEY
  'Content-Type' = 'application/json'
  'Accept' = 'application/json'
}
foreach ($wf in $c1Wfs) {
  try { Invoke-RestMethod -Method POST -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)/deactivate" -Headers $actHdr -Body '{}' | Out-Null } catch {}
}
Start-Sleep -Seconds 3
foreach ($wf in $c1Wfs) {
  try {
    Invoke-RestMethod -Method POST -Uri "$N8N_BASE/api/v1/workflows/$($wf.id)/activate" -Headers $actHdr -Body '{}' | Out-Null
    Write-Host "  [OK] Activated: $($wf.name)" -ForegroundColor Green
  } catch {
    Write-Host "  [FAIL] $($wf.name): $($_.Exception.Message)" -ForegroundColor Red
  }
}

# Smoke test RUFLO
Write-Host ''
Write-Host 'Smoke test RUFLO...' -ForegroundColor Cyan
$rufloBody = '{"client_id":"test-client","request":"analyze campaign","context_type":"general"}'
try {
  $r = Invoke-RestMethod -Method POST -Uri "$N8N_BASE/webhook/router-entry" -ContentType 'application/json' -Body $rufloBody
  Write-Host "  [RUFLO] $($r.message)" -ForegroundColor Green
} catch {
  Write-Host "  [RUFLO] $($_.Exception.Message)" -ForegroundColor Red
}

Start-Sleep -Seconds 8

# Check Supabase
$zHdr = @{ 'x-api-key' = $INT_KEY }
$out = Invoke-RestMethod -Method GET -Uri "https://zero-risk-platform.vercel.app/api/analytics/agent-outcomes?days=1&limit=10" -Headers $zHdr
Write-Host ''
Write-Host "Supabase agent_outcomes: $($out.count) rows" -ForegroundColor Cyan
Write-Host "By agent: $($out.summary.by_agent.PSObject.Properties.Name -join ', ')"

# Check RUFLO last execution
$wf = $zrWfs | Where-Object { $_.name -like '*RUFLO*' } | Select-Object -First 1
if ($wf) {
  $execs = Invoke-RestMethod -Method GET -Uri "$N8N_BASE/api/v1/executions?workflowId=$($wf.id)&limit=1&includeData=true" -Headers $hdr
  $exec = $execs.data[0]
  if ($exec) {
    $runData = $exec.data.resultData.runData
    $nodes = $runData.PSObject.Properties.Name
    $errNode = $null; $errMsg = $null
    foreach ($n in $nodes) {
      if ($runData.$n[0].error) { $errNode = $n; $errMsg = $runData.$n[0].error.message; break }
    }
    if ($errNode) {
      Write-Host ''
      Write-Host "RUFLO exec $($exec.id) - FAIL at '$errNode' - $errMsg" -ForegroundColor Red
    } else {
      Write-Host ''
      Write-Host "RUFLO exec $($exec.id) - OK, $($nodes.Count) nodes completed" -ForegroundColor Green
    }
  }
}
