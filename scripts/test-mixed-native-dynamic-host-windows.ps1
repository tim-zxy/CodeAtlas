# Compile declarations, then call pure metadata/adapter tests only. Never HOST.Start/Run/Win32.
$ErrorActionPreference='Stop'
$names=@('mixed-process-collector.cs','mixed-native-observer-policy.cs','mixed-native-debug-event-bridge.cs','mixed-native-observer-windows.cs','mixed-native-control-mailbox.cs','mixed-native-control-pipe.cs','mixed-native-observer-loop.cs','mixed-native-host-startup.cs','mixed-native-host-windows.cs','mixed-native-dynamic-observer-policy.cs','mixed-native-dynamic-debug-event-bridge.cs','mixed-native-dynamic-observer-loop.cs','mixed-native-dynamic-host-windows.cs','test-mixed-native-dynamic-host-windows-double.cs')
Add-Type -Path @($names|ForEach-Object {Join-Path $PSScriptRoot $_})
[MixedProcessCollector]::DynamicHostFactoryUnit()|ConvertTo-Json -Compress
