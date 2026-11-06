$ErrorActionPreference='Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'mixed-native-observer-policy.cs'),(Join-Path $PSScriptRoot 'mixed-native-debug-event-bridge.cs'),(Join-Path $PSScriptRoot 'mixed-native-control-mailbox.cs'),(Join-Path $PSScriptRoot 'mixed-native-control-pipe.cs'),(Join-Path $PSScriptRoot 'mixed-native-observer-loop.cs'),(Join-Path $PSScriptRoot 'test-mixed-native-observer-loop-double.cs'))
[MixedNativeBoundedLoopUnit]::Run()
