# Run this ONCE in an ELEVATED PowerShell (Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File "register-startup-tasks.ps1"
#
# Registers Windows Scheduled Tasks so every backend service this app depends on comes back
# up on its own after a reboot - InstantMesh already has its own task
# (InstantMesh/setup_startup_task.ps1, untouched by this script); this covers the rest:
#   1. AKAAR Portproxy Sync    - re-points the WSL-IP-dependent netsh portproxy rules at
#                                 whatever WSL's IP actually is this boot (see
#                                 sync-wsl-portproxy.ps1 - that IP changes every reboot).
#                                 Runs elevated (RunLevel Highest); the other three don't
#                                 need to.
#   2. instantmesh-proxy Startup
#   3. moderation-service Startup
#   4. Fooocus-API Startup
#
# Deliberately NOT included: the frontend (Vite dev server) - that's run on demand, not a
# standing service.
#
# All four are boot-triggered and start in parallel (no explicit dependency ordering) -
# each tolerates its dependencies not being ready yet: instantmesh-proxy's own requests
# just fail transiently (502, not a crash) until InstantMesh/the portproxy sync catch up,
# and the portproxy-sync script itself retries until WSL's network is actually up. Same
# S4U-logon / restart-on-failure pattern as the existing InstantMesh task, so no password
# ever needs to be stored.

$repoRoot = "C:\Users\abhim\Documents\Projects\akaar"
$winUser = "Abhi"

$node = "C:\Program Files\nodejs\node.exe"
$proxyDir = "$repoRoot\instantmesh-proxy"
$moderationDir = "$repoRoot\moderation-service"
$moderationPython = "$moderationDir\venv\Scripts\python.exe"
$fooocusApiDir = "$repoRoot\Fooocus-API"
$fooocusPython = "$repoRoot\Fooocus\venv\Scripts\python.exe"
$syncScript = "$repoRoot\scripts\sync-wsl-portproxy.ps1"

# Parameter name verified against this system's actual ScheduledTasks module
# (Get-Command New-ScheduledTaskSettingsSet).Parameters.Keys - it's MultipleInstances, not
# MultipleInstancesPolicy (the first version of this script had the wrong name, which failed
# loudly enough to notice, but see the -ErrorAction Stop / try-catch below too: that failure
# still let Register-ScheduledTask run with a null Settings arg, which ALSO failed, but the
# script printed "Registered" anyway since nothing was checking for errors before that
# Write-Host - fixed here so a real failure can never again print a false success message).
$restartSettings = @{
    ExecutionTimeLimit          = ([TimeSpan]::Zero)
    RestartCount                = 3
    RestartInterval              = (New-TimeSpan -Minutes 1)
    MultipleInstances            = 'IgnoreNew'
    StartWhenAvailable          = $true
    AllowStartIfOnBatteries     = $true
    DontStopIfGoingOnBatteries  = $true
}

function Register-AkaarTask($Name, $Execute, $Argument, $WorkingDirectory, $RunLevel) {
    $actionArgs = @{ Execute = $Execute; Argument = $Argument }
    if ($WorkingDirectory) { $actionArgs.WorkingDirectory = $WorkingDirectory }

    try {
        $action = New-ScheduledTaskAction @actionArgs -ErrorAction Stop
        $trigger = New-ScheduledTaskTrigger -AtStartup -ErrorAction Stop
        $principal = New-ScheduledTaskPrincipal -UserId $winUser -LogonType S4U -RunLevel $RunLevel -ErrorAction Stop
        $settings = New-ScheduledTaskSettingsSet @restartSettings -ErrorAction Stop

        Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger `
            -Principal $principal -Settings $settings -Force -ErrorAction Stop `
            -Description "AKAAR backend service - registered by scripts/register-startup-tasks.ps1" | Out-Null
    } catch {
        Write-Host "FAILED to register '$Name': $($_.Exception.Message)" -ForegroundColor Red
        return
    }

    # Confirm it actually exists now rather than trusting Register-ScheduledTask's own
    # success - belt and braces after the false-positive above.
    if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
        Write-Host "Registered '$Name'" -ForegroundColor Green
    } else {
        Write-Host "FAILED to register '$Name': task not found after registration attempt" -ForegroundColor Red
    }
}

Write-Host "Registering startup tasks..." -ForegroundColor Cyan

# 1. Portproxy sync - needs admin (netsh portproxy).
Register-AkaarTask `
    -Name "AKAAR Portproxy Sync" `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$syncScript`"" `
    -RunLevel Highest

# 2. instantmesh-proxy
Register-AkaarTask `
    -Name "instantmesh-proxy Startup" `
    -Execute $node `
    -Argument "server.js" `
    -WorkingDirectory $proxyDir `
    -RunLevel Limited

# 3. moderation-service
Register-AkaarTask `
    -Name "moderation-service Startup" `
    -Execute $moderationPython `
    -Argument "-m uvicorn main:app --host 127.0.0.1 --port 8790" `
    -WorkingDirectory $moderationDir `
    -RunLevel Limited

# 4. Fooocus-API (launched from Fooocus-API/ as its working directory, using Fooocus's own
# venv - matches how it's actually been run manually all along, confirmed against the live
# process's real command line + cwd, not guessed from AGENTS.md's doc alone, which turned
# out to describe a different cwd than what's actually running)
Register-AkaarTask `
    -Name "Fooocus-API Startup" `
    -Execute $fooocusPython `
    -Argument "main.py --skip-pip --host 0.0.0.0 --port 8888 --base-url http://10.231.121.101:8888" `
    -WorkingDirectory $fooocusApiDir `
    -RunLevel Limited

Write-Host ""
Write-Host "Done. All four tasks will run at next boot. To start them now without rebooting:" -ForegroundColor Yellow
Write-Host '  Start-ScheduledTask -TaskName "AKAAR Portproxy Sync"'
Write-Host '  Start-ScheduledTask -TaskName "instantmesh-proxy Startup"'
Write-Host '  Start-ScheduledTask -TaskName "moderation-service Startup"'
Write-Host '  Start-ScheduledTask -TaskName "Fooocus-API Startup"'
Write-Host ""
Write-Host "Note: Start-ScheduledTask will fail with 'already running' for any service you" -ForegroundColor Yellow
Write-Host "still have running manually from this session - stop those processes first if you" -ForegroundColor Yellow
Write-Host "want to test the tasks starting them fresh." -ForegroundColor Yellow
