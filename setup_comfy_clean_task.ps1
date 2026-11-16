$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "clean_comfy_output.ps1"
$taskName = "Tavern ComfyUI Cleanup"

if (!(Test-Path -LiteralPath $script)) {
  throw "找不到清理脚本：$script"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -KeepDays 7 -KeepCount 100"

$trigger = New-ScheduledTaskTrigger -Daily -At "04:00"

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "每天清理 ComfyUI output 中过旧的 avatar_*.png，保留最近 100 张和 7 天内文件。" -Force | Out-Null

Write-Output "已创建定时任务：$taskName（每天 04:00）"
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State | Format-Table -AutoSize
