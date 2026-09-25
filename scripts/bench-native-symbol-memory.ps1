param(
    [int[]]$FieldCounts = @(1000, 3000, 9000, 50000),
    [ValidateSet('unique-fields', 'short-fields', 'semicolons', 'nested-parens')]
    [string]$Shape = 'unique-fields'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$binary = Join-Path $repoRoot 'target/debug/codeatlas-native-analyzer.exe'
if (-not (Test-Path -LiteralPath $binary)) {
    throw "Build the native analyzer first: $binary"
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("codeatlas-symbol-memory-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'src') | Out-Null
try {
    foreach ($count in $FieldCounts) {
        $body = [System.Text.StringBuilder]::new()
        [void]$body.Append('class Many { ')
        if ($Shape -eq 'nested-parens') {
            [void]$body.Append('int a = ')
            [void]$body.Append('(' * $count)
            [void]$body.Append('1')
            [void]$body.Append(')' * $count)
            [void]$body.Append(';')
        } else {
            for ($i = 0; $i -lt $count; $i++) {
                switch ($Shape) {
                    'unique-fields' { [void]$body.Append("int f$i; ") }
                    'short-fields' { [void]$body.Append('int a; ') }
                    'semicolons' { [void]$body.Append(';') }
                }
            }
        }
        [void]$body.Append('}')
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($body.ToString())
        $file = Join-Path $fixtureRoot 'src/Many.java'
        [System.IO.File]::WriteAllBytes($file, $bytes)
        $fingerprint = 'sha256:' + [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        $request = @{
            protocolVersion = 1; requestId = 'memory-benchmark'; type = 'ANALYZE'
            payload = @{
                irSchemaVersion = 1; providerSnapshotId = 'benchmark-snapshot'; deadlineEpochMs = $null
                repository = @{ id = 'benchmark-repository'; rootPath = $fixtureRoot }
                requestedCapabilities = @('SYMBOL')
                resourceBudget = @{ maxDurationMs = 30000; maxMemoryBytes = 16777216; maxEvents = 10000 }
                revision = @{ id = 'benchmark-revision'; repositoryId = 'benchmark-repository'; contentFingerprint = 'sha256:benchmark'; kind = 'WORKTREE'; baseRevisionId = $null }
                sourceFiles = @(@{
                    id = 'benchmark-file'; repositoryId = 'benchmark-repository'; revisionId = 'benchmark-revision'
                    path = 'src/Many.java'; contentFingerprint = $fingerprint
                    classification = @{ role = 'SOURCE'; provenance = 'AUTHORED'; contentKind = 'TEXT' }
                    languageHint = 'java'; sensitivity = 'PUBLIC'
                })
            }
        } | ConvertTo-Json -Depth 12 -Compress
        $start = [System.Diagnostics.ProcessStartInfo]::new()
        $start.FileName = $binary
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardInput = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        $process = [System.Diagnostics.Process]::Start($start)
        try {
            $outTask = $process.StandardOutput.ReadToEndAsync()
            $errTask = $process.StandardError.ReadToEndAsync()
            $process.StandardInput.Write($request + "`n")
            $process.StandardInput.Close()
            $peak = [long]0
            while (-not $process.HasExited) {
                $process.Refresh()
                $peak = [Math]::Max($peak, $process.PeakWorkingSet64)
                Start-Sleep -Milliseconds 1
            }
            $process.WaitForExit()
            $stdout = $outTask.GetAwaiter().GetResult()
            $stderr = $errTask.GetAwaiter().GetResult()
            $events = @($stdout.Trim() -split "`n")
            $terminal = $events[-1] | ConvertFrom-Json
            [pscustomobject]@{
                shape = $Shape
                fieldCount = $count
                sourceBytes = $bytes.Length
                peakWorkingSetBytes = $peak
                exitCode = $process.ExitCode
                terminal = $terminal.type
                errorCode = $terminal.payload.error.code
                stderr = $stderr.Trim()
            }
        } finally {
            $process.Dispose()
        }
    }
} finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    if (-not $resolvedFixture.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not [System.IO.Path]::GetFileName($resolvedFixture).StartsWith('codeatlas-symbol-memory-', [System.StringComparison]::Ordinal)) {
        throw "Refusing to remove unexpected benchmark path: $resolvedFixture"
    }
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
}
