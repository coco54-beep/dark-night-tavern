[CmdletBinding()]
param(
  [string]$OutputDir = "D:\env\ComfyUI\output",
  [string]$Pattern = "avatar_*.png",
  [int]$KeepDays = 7,
  [int]$KeepCount = 100,
  [switch]$DryRun,
  [string]$LogFile = "D:\coco\酒馆\comfy_clean.log"
)

$ErrorActionPreference = "Stop"

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
  try {
    $dir = Split-Path -Parent $LogFile
    if ($dir -and !(Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  } catch {}
  Write-Output $line
}

if (!(Test-Path -LiteralPath $OutputDir)) {
  Write-Log "输出目录不存在：$OutputDir"
  exit 1
}

$now = Get-Date
$cutoff = $now.AddDays(-$KeepDays)
$files = @(Get-ChildItem -LiteralPath $OutputDir -Recurse -File -Filter $Pattern -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending)

if (!$files.Count) {
  Write-Log "没有找到匹配文件：$Pattern"
  exit 0
}

$keep = New-Object 'System.Collections.Generic.HashSet[string]'
$files | Select-Object -First $KeepCount | ForEach-Object { [void]$keep.Add($_.FullName) }

$toDelete = @($files | Where-Object {
  $_.LastWriteTime -lt $cutoff -and !$keep.Contains($_.FullName)
})

$bytes = ($toDelete | Measure-Object Length -Sum).Sum
$mb = if ($bytes) { [math]::Round($bytes / 1MB, 1) } else { 0 }

if (!$toDelete.Count) {
  Write-Log "无需清理：共 $($files.Count) 个文件，保留最近 $KeepCount 个和 ${KeepDays} 天内文件。"
  exit 0
}

if ($DryRun) {
  Write-Log "[预演] 将清理 $($toDelete.Count) 个文件，释放约 $mb MB；保留最近 $KeepCount 个和 ${KeepDays} 天内文件。"
  $toDelete | Select-Object -First 10 | ForEach-Object { Write-Log "  将删除：$($_.FullName)  ($([math]::Round($_.Length/1MB,2)) MB, $($_.LastWriteTime))" }
  exit 0
}

$deleted = 0
$freed = 0
foreach ($file in $toDelete) {
  try {
    $size = $file.Length
    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
    $deleted++
    $freed += $size
  } catch {
    Write-Log "删除失败：$($file.FullName) — $($_.Exception.Message)"
  }
}

$freedMb = [math]::Round($freed / 1MB, 1)
Write-Log "清理完成：删除 $deleted 个文件，释放约 $freedMb MB；保留最近 $KeepCount 个和 ${KeepDays} 天内文件。"

# 清掉因此变空的子目录，但保留输出根目录
Get-ChildItem -LiteralPath $OutputDir -Recurse -Directory -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending |
  Where-Object { @(Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue).Count -eq 0 } |
  ForEach-Object {
    if ($_.FullName -ne (Resolve-Path -LiteralPath $OutputDir).Path) {
      try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } catch {}
    }
  }
