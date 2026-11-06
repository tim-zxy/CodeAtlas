$ErrorActionPreference='Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'mixed-native-host-startup.cs'),(Join-Path $PSScriptRoot 'mixed-native-host-consumption-lifetime.cs'),(Join-Path $PSScriptRoot 'mixed-native-host-launch-inventory.cs'),(Join-Path $PSScriptRoot 'test-mixed-native-host-launch-inventory-double.cs'))
[MixedNativeHostLaunchInventoryUnit]::Run()
