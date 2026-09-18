<#
.SYNOPSIS
    Convenience script to stop all CodeArena '26 disaster response services.
.EXAMPLE
    .\stop-services.ps1
#>

& "$PSScriptRoot\services.ps1" -Action stop
