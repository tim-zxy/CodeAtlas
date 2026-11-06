# Pure Add-Type/in-memory unit only. No collector, native tool, policy or OS API.
$ErrorActionPreference = 'Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'mixed-native-control-mailbox.cs'), (Join-Path $PSScriptRoot 'test-mixed-native-control-mailbox-double.cs'))
$passed = [MixedNativeControlMailboxDouble]::Run()
@{kind='PURE_MIXED_NATIVE_CONTROL_MAILBOX_UNIT';passed=$passed;actualCollectorRuns=0;actualNativeRuns=0;actualDatabaseRuns=0}|ConvertTo-Json -Compress