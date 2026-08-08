# Re-points the netsh portproxy rules that forward InstantMesh's port (43839) at WSL2's
# current VM IP - that IP is dynamically assigned and changes on every reboot/WSL restart,
# so a rule pointed at yesterday's IP silently breaks instantmesh-proxy's connection to
# InstantMesh until this is re-run. Run automatically at boot (see
# register-startup-tasks.ps1) so this never has to be done by hand again.
#
# Background (see AGENTS.md progress log, 2026-08-08): WSL2's own built-in
# 127.0.0.1->WSL localhost-forwarding has been unreliable on this box, so instantmesh-proxy
# and the two portproxy rules below all point at the WSL VM's own IP directly instead of
# via 127.0.0.1 - this script is what keeps that IP current.
#
# Must run elevated (netsh portproxy add/delete requires admin) - registered with
# RunLevel Highest in register-startup-tasks.ps1, not meant to be run interactively as a
# normal user, though it's harmless to run manually from an elevated prompt too.

$port = 43839
# ZeroTier + LAN addresses - see instantmesh-proxy/.env's ALLOWED_ORIGINS/INSTANTMESH_TARGET
# comments for why these two specifically.
$listenAddresses = @('10.231.121.101', '10.13.1.125')
$maxAttempts = 30
$delaySeconds = 10

Write-Host "Waiting for WSL network to come up..." -ForegroundColor Cyan
$wslIp = $null
for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $raw = (wsl hostname -I 2>$null)
        $candidate = ($raw -split '\s+')[0]
        if ($candidate -match '^\d+\.\d+\.\d+\.\d+$') {
            $wslIp = $candidate
            break
        }
    } catch {
        # WSL not ready yet - fall through to retry.
    }
    Start-Sleep -Seconds $delaySeconds
}

if (-not $wslIp) {
    Write-Error "Gave up waiting for a WSL IP after $($maxAttempts * $delaySeconds)s - portproxy NOT updated. InstantMesh's own boot task may not have started WSL yet; re-run this script manually once it has."
    exit 1
}

Write-Host "WSL IP: $wslIp - updating portproxy rules for port $port..." -ForegroundColor Cyan
foreach ($addr in $listenAddresses) {
    netsh interface portproxy delete v4tov4 listenaddress=$addr listenport=$port | Out-Null
    netsh interface portproxy add v4tov4 listenaddress=$addr listenport=$port connectaddress=$wslIp connectport=$port | Out-Null
    Write-Host "  $addr`:$port -> $wslIp`:$port"
}

Write-Host "Done." -ForegroundColor Green
