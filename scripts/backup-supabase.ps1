$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backupRoot = Join-Path $projectRoot "backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $backupRoot $timestamp

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Read-FirstJsonObject {
  param([string]$Text)

  $start = $Text.IndexOf("{")
  if ($start -lt 0) {
    throw "Supabase CLI did not return JSON."
  }

  $depth = 0
  $inString = $false
  $escaped = $false

  for ($index = $start; $index -lt $Text.Length; $index++) {
    $char = $Text[$index]

    if ($escaped) {
      $escaped = $false
      continue
    }

    if ($char -eq "\") {
      $escaped = $true
      continue
    }

    if ($char -eq '"') {
      $inString = -not $inString
      continue
    }

    if ($inString) {
      continue
    }

    if ($char -eq "{") {
      $depth++
    } elseif ($char -eq "}") {
      $depth--
      if ($depth -eq 0) {
        return $Text.Substring($start, $index - $start + 1) | ConvertFrom-Json
      }
    }
  }

  throw "Could not parse Supabase CLI JSON output."
}

$tables = @(
  "meal_templates",
  "daily_meals",
  "activity_logs",
  "weight_logs",
  "meal_logs",
  "manual_alerts",
  "care_item_templates",
  "notebook_members",
  "app_audit_log"
)

Push-Location $projectRoot
try {
  $tableSelects = ($tables | ForEach-Object {
    "'$_', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select * from public.$_) t)"
  }) -join ", "
  $sql = "select jsonb_build_object($tableSelects)::text as backup;"
  $stderrFile = Join-Path $backupDir "supabase.stderr.log"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $raw = & npx supabase db query "$sql" --linked --output json 2>$stderrFile | Out-String
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    $stderr = Get-Content -Path $stderrFile -Raw -ErrorAction SilentlyContinue
    throw "Failed to back up Supabase data. $stderr $raw"
  }

  $result = Read-FirstJsonObject $raw
  $backupJson = $result.rows[0].backup
  $backup = $backupJson | ConvertFrom-Json

  foreach ($table in $tables) {
    $tableRows = @($backup.$table)
    ConvertTo-Json -InputObject $tableRows -Depth 100 | Set-Content -Path (Join-Path $backupDir "$table.json") -Encoding UTF8
  }
  Remove-Item -Path $stderrFile -Force -ErrorAction SilentlyContinue

  Copy-Item -Path (Join-Path $projectRoot "supabase-schema.sql") -Destination (Join-Path $backupDir "supabase-schema.sql") -Force
  Copy-Item -Path (Join-Path $projectRoot "supabase\migrations") -Destination (Join-Path $backupDir "migrations") -Recurse -Force

  $manifest = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    projectRef = "noljdvbuvbdvjqeomivj"
    tables = $tables
    type = "json-table-export"
  }

  $manifest | ConvertTo-Json | Set-Content -Path (Join-Path $backupDir "manifest.json") -Encoding UTF8

  Get-ChildItem -Path $backupRoot -Directory |
    Sort-Object Name -Descending |
    Select-Object -Skip 14 |
    Remove-Item -Recurse -Force
} finally {
  Pop-Location
}
