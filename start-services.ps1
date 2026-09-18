<#
.SYNOPSIS
    Convenience script to start all CodeArena '26 disaster response services.
.EXAMPLE
    .\start-services.ps1
    .\start-services.ps1 -ResetDemo
    .\start-services.ps1 -Foreground
#>

param(
    [switch]$Foreground,
    [switch]$ResetDemo
)

& "$PSScriptRoot\services.ps1" -Action start -Foreground:$Foreground -ResetDemo:$ResetDemo
