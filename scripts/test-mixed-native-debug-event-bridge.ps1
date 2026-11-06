# Compile all event adapter declarations, then exercise only injected fake operations.
$ErrorActionPreference='Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'mixed-native-observer-policy.cs'),(Join-Path $PSScriptRoot 'mixed-native-debug-event-bridge.cs'),(Join-Path $PSScriptRoot 'mixed-process-collector.cs'),(Join-Path $PSScriptRoot 'mixed-native-observer-windows.cs'),(Join-Path $PSScriptRoot 'mixed-native-control-mailbox.cs'),(Join-Path $PSScriptRoot 'mixed-native-control-pipe.cs'),(Join-Path $PSScriptRoot 'mixed-native-observer-loop.cs'),(Join-Path $PSScriptRoot 'test-mixed-native-debug-event-double.cs'))
[MixedNativeDebugBridgeUnit]::Run()
