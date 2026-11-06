$ErrorActionPreference='Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'mixed-native-host-startup.cs'),(Join-Path $PSScriptRoot 'mixed-native-host-consumption-lifetime.cs'),(Join-Path $PSScriptRoot 'test-mixed-native-host-consumption-lifetime-double.cs'))
[MixedNativeHostConsumptionUnit]::Run()
