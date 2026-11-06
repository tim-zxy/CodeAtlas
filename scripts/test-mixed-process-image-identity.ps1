# Offline unit test only: never invoke MixedProcessCollector.Run or acquisition scripts.
$ErrorActionPreference = 'Stop'
$collectorSource = Join-Path $PSScriptRoot 'mixed-process-collector.cs'
Add-Type -Path $collectorSource
$identityMethod = [MixedProcessCollector].GetMethod('ImageHash', [Reflection.BindingFlags]'NonPublic,Static')
if ($null -eq $identityMethod) { throw 'ImageHash method missing' }
$identity = $identityMethod.CreateDelegate([Func[IntPtr,string,MixedProcessCollector+Entry,string]])
$ownedImage = Join-Path ([IO.Path]::GetTempPath()) ('codeatlas-image-identity-' + [Guid]::NewGuid().ToString('N') + '.bin')
$bytes = [Text.Encoding]::UTF8.GetBytes('owned offline image identity control')
$created = $false
$ownedStream = $null
try {
    $ownedStream = [IO.File]::Open($ownedImage, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
    $created = $true
    $ownedStream.Write($bytes, 0, $bytes.Length)
    $ownedStream.Flush()
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $expected = [BitConverter]::ToString($hasher.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
    $handle = $ownedStream.SafeFileHandle.DangerousGetHandle()

    $matching = New-Object MixedProcessCollector+Entry
    $actual = $identity.Invoke($handle, $ownedImage, $matching)
    if ($actual -ne $expected) { throw 'Matching image hash differs' }

    $rejected = New-Object MixedProcessCollector+Entry
    $failure = $null
    try { $null = $identity.Invoke($handle, ($ownedImage + '.unexpected'), $rejected) }
    catch { $failure = $_.Exception; while ($null -ne $failure.InnerException) { $failure = $failure.InnerException } }
    if ($null -eq $failure -or $failure.Message -ne 'UNEXPECTED_PROCESS') { throw 'Unexpected path was not rejected' }
    if ($rejected.imagePath -ne [IO.Path]::GetFullPath($ownedImage)) { throw 'Rejected image path missing' }
    if ($rejected.imageSha256 -ne $expected) { throw 'Rejected image digest missing' }

    $ownedStream.Position = 0
    if ($ownedStream.ReadByte() -ne $bytes[0]) { throw 'Borrowed identity helper closed the owned file handle' }

    $ownedStream.Dispose()
    $ownedStream = [IO.File]::Open($ownedImage, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    $unreadable = New-Object MixedProcessCollector+Entry
    $failure = $null
    try { $null = $identity.Invoke($ownedStream.SafeFileHandle.DangerousGetHandle(), ($ownedImage + '.unexpected'), $unreadable) }
    catch { $failure = $_.Exception; while ($null -ne $failure.InnerException) { $failure = $failure.InnerException } }
    if ($null -eq $failure -or $failure.Message -ne 'UNEXPECTED_PROCESS') { throw 'Diagnostic read failure changed path rejection' }
    if ($null -ne $unreadable.imageSha256) { throw 'Unreadable image fabricated a digest' }

    $missing = New-Object MixedProcessCollector+Entry
    $failure = $null
    try { $null = $identity.Invoke([IntPtr]::Zero, $ownedImage, $missing) }
    catch { $failure = $_.Exception; while ($null -ne $failure.InnerException) { $failure = $failure.InnerException } }
    if ($null -eq $failure -or $failure.Message -ne 'MISSING_IMAGE') { throw 'Missing image handle was not rejected' }
    if ($null -ne $missing.imageSha256) { throw 'Missing handle fabricated an image digest' }
    # Pure synthetic cleanup state: never launch or inspect a process.
    $cleanupMethod = [MixedProcessCollector].GetMethod('CleanupComplete', [Reflection.BindingFlags]'NonPublic,Static')
    if ($null -eq $cleanupMethod) { throw 'CleanupComplete method missing' }
    $cleanup = $cleanupMethod.CreateDelegate([Func[Collections.Generic.List[MixedProcessCollector+Entry],bool,bool,bool]])
    $entries = New-Object 'Collections.Generic.List[MixedProcessCollector+Entry]'
    $hostEntry = New-Object MixedProcessCollector+Entry
    $hostEntry.osExited = $true
    $hostEntry.handleReleased = $true
    $entries.Add($hostEntry)
    if (-not $cleanup.Invoke($entries, $true, $false)) { throw 'Owned closed root cleanup rejected' }
    if ($cleanup.Invoke($entries, $false, $false)) { throw 'Unanchored root cleanup accepted' }
    if ($cleanup.Invoke($entries, $true, $true)) { throw 'Untracked CREATE cleanup accepted' }
    if ($cleanup.Invoke($entries, $false, $true)) { throw 'Unanchored untracked cleanup accepted' }
    $childEntry = New-Object MixedProcessCollector+Entry
    $childEntry.osExited = $true
    $childEntry.handleReleased = $true
    $entries.Add($childEntry)
    if (-not $cleanup.Invoke($entries, $true, $false)) { throw 'Owned closed descendant cleanup rejected' }
    $childEntry.osExited = $false
    if ($cleanup.Invoke($entries, $true, $false)) { throw 'Missing descendant exit cleanup accepted' }
    $childEntry.osExited = $true
    $childEntry.handleReleased = $false
    if ($cleanup.Invoke($entries, $true, $false)) { throw 'Missing descendant handle release cleanup accepted' }
    $entries.Clear()
    if ($cleanup.Invoke($entries, $true, $false)) { throw 'Empty process cleanup accepted' }
    $rootFlagsField = [MixedProcessCollector].GetField('RootCreationFlags', [Reflection.BindingFlags]'NonPublic,Static')
    if ($null -eq $rootFlagsField) { throw 'Root creation flags missing' }
    $rootFlags = [uint32]$rootFlagsField.GetRawConstantValue()
    if (($rootFlags -band 1) -ne 1) { throw 'Root lost descendant debugging' }
    if (($rootFlags -band 8) -ne 8) { throw 'Root is not detached from console' }
    if (($rootFlags -band 0x80400) -ne 0x80400) { throw 'Root lost Unicode or explicit handle inheritance' }
    if (($rootFlags -band 0x09000012) -ne 0) { throw 'Root has conflicting console or debug/job escape flags' }
    @{ kind = 'OFFLINE_IMAGE_IDENTITY_UNIT_ONLY'; assertions = 21; acquisitionRuns = 0; measurementEligible = $false } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $ownedStream) { $ownedStream.Dispose() }
    if ($created) { [IO.File]::Delete($ownedImage) }
}
