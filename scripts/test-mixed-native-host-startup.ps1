$ErrorActionPreference='Stop'
$names=@('mixed-native-host-startup.cs','mixed-native-host-windows.cs','mixed-process-collector.cs','mixed-native-observer-policy.cs','mixed-native-debug-event-bridge.cs','mixed-native-observer-windows.cs','mixed-native-control-mailbox.cs','mixed-native-control-pipe.cs','mixed-native-observer-loop.cs','test-mixed-native-host-startup-double.cs')
Add-Type -Path @($names|ForEach-Object {Join-Path $PSScriptRoot $_})
[MixedNativeHostStartupUnit]::Run()
