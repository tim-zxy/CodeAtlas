param(
    [Parameter(Mandatory = $true)][ValidateSet('Validate', 'Extract', 'Create')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$ArchivePath,
    [string]$RootPath
)
$ErrorActionPreference = 'Stop'
$record = ConvertFrom-Json -AsHashtable -InputObject ([Console]::In.ReadToEnd())

function Assert-EntryPath([string]$name) {
    foreach ($part in $name.Split('/')) {
        if ($part -cnotmatch '^[A-Za-z0-9_.-]+$' -or $part -in @('.', '..') -or
            $part.EndsWith('.') -or $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') {
            throw 'Unsafe ZIP entry path'
        }
    }
}

function Assert-Directory([string]$directory) {
    $info = [IO.DirectoryInfo]::new($directory)
    if (-not $info.Exists -or (($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw 'ZIP destination directory is absent or linked'
    }
}

function Assert-NativeDecodedEntry($item) {
    # ZipArchiveEntry.Open clamps to its declared Length. Independently decode
    # through Windows' native ZIP reader; NEVER let tar write filesystem entries.
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = [IO.Path]::Combine([Environment]::GetFolderPath([Environment+SpecialFolder]::System), 'tar.exe')
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.RedirectStandardInput = $true
    foreach ($argument in @('-xOf', $ArchivePath, '--', $item.path)) { $start.ArgumentList.Add($argument) }
    $start.Environment.Clear()
    foreach ($key in @('SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP')) {
        $value = [Environment]::GetEnvironmentVariable($key)
        if ($null -ne $value) { $start.Environment[$key] = $value }
    }
    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $start
    $started = $false
    $stderrTask = $null
    $hash = [Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
    try {
        $started = $child.Start()
        if (-not $started) { throw 'Native ZIP verifier unavailable' }
        $child.StandardInput.Close()
        $stderrTask = $child.StandardError.BaseStream.CopyToAsync([IO.Stream]::Null)
        $buffer = [byte[]]::new(65536)
        [long]$decoded = 0
        while ($true) {
            $remaining = [long]$item.bytes - $decoded
            $count = $child.StandardOutput.BaseStream.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining + 1))
            if ($count -eq 0) { break }
            $decoded += $count
            if ($decoded -gt $item.bytes) { throw 'ZIP decoded length exceeds declared inventory' }
            $hash.AppendData($buffer, 0, $count)
        }
        $child.WaitForExit()
        [void]$stderrTask.GetAwaiter().GetResult()
        if ($child.ExitCode -ne 0 -or $decoded -ne $item.bytes) { throw 'Native ZIP decoded length or integrity failure' }
        if ([Convert]::ToHexString($hash.GetHashAndReset()).ToLowerInvariant() -cne $item.sha256) {
            throw 'Native ZIP decoded hash mismatch'
        }
    } finally {
        if ($started) {
            if (-not $child.HasExited) { $child.Kill($true) }
            $child.WaitForExit()
            if ($null -ne $stderrTask) { [void]$stderrTask.GetAwaiter().GetResult() }
        }
        $hash.Dispose()
        $child.Dispose()
    }
}

if ($Mode -eq 'Create') {
    if ([string]::IsNullOrEmpty($RootPath) -or [IO.Path]::GetFullPath($RootPath) -cne $RootPath) {
        throw 'Invalid ZIP source root'
    }
    Assert-Directory $RootPath
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($item in $record.entries) {
        Assert-EntryPath $item.path
        if (-not $seen.Add($item.path)) { throw 'Duplicate ZIP source' }
        $parts = $item.path.Split('/')
        $parent = $RootPath
        for ($index = 0; $index -lt $parts.Length - 1; $index++) {
            $parent = [IO.Path]::Combine($parent, $parts[$index])
            Assert-Directory $parent
        }
        $source = [IO.FileInfo]::new([IO.Path]::Combine($parent, $parts[-1]))
        if (-not $source.Exists -or $source.Length -ne $item.bytes -or
            (($source.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
            throw 'ZIP source is missing, linked or changed'
        }
    }
    $output = [IO.File]::Open($ArchivePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $zip = [IO.Compression.ZipArchive]::new($output, [IO.Compression.ZipArchiveMode]::Create, $true)
        try {
            foreach ($item in $record.entries) {
                $source = [IO.Path]::Combine($RootPath, $item.path)
                $reader = [IO.File]::Open($source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
                try {
                    if ($reader.Length -ne $item.bytes) { throw 'ZIP source length changed' }
                    $entry = $zip.CreateEntry($item.path, [IO.Compression.CompressionLevel]::Fastest)
                    $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
                    $entry.ExternalAttributes = 0
                    $writer = $entry.Open()
                    $hash = [Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
                    try {
                        $buffer = [byte[]]::new(65536)
                        [long]$written = 0
                        while ($true) {
                            $remaining = [long]$item.bytes - $written
                            $count = $reader.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining + 1))
                            if ($count -eq 0) { break }
                            $written += $count
                            if ($written -gt $item.bytes) { throw 'ZIP source grew' }
                            $hash.AppendData($buffer, 0, $count)
                            $writer.Write($buffer, 0, $count)
                        }
                        if ($written -ne $item.bytes -or
                            [Convert]::ToHexString($hash.GetHashAndReset()).ToLowerInvariant() -cne $item.sha256) {
                            throw 'ZIP source bytes changed'
                        }
                    } finally { $hash.Dispose(); $writer.Dispose() }
                } finally { $reader.Dispose() }
            }
        } finally { $zip.Dispose() }
        $output.Flush($true)
    } finally { $output.Dispose() }
    @{ verified = $true; mode = $Mode; entries = $record.entries.Count } | ConvertTo-Json -Compress
    exit 0
}

$file = [IO.File]::Open($ArchivePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    if ($file.Length -ne $record.bytes) { throw 'Archive byte length mismatch' }
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $archiveHash = [Convert]::ToHexString($algorithm.ComputeHash($file)).ToLowerInvariant() }
    finally { $algorithm.Dispose() }
    if ($archiveHash -cne $record.sha256) { throw 'Archive hash mismatch' }
    $file.Position = 0
    $zip = [IO.Compression.ZipArchive]::new($file, [IO.Compression.ZipArchiveMode]::Read, $true)
    try {
        $expected = [Collections.Generic.Dictionary[string, object]]::new([StringComparer]::Ordinal)
        $folded = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach ($item in $record.entries) {
            Assert-EntryPath $item.path
            if (-not $folded.Add($item.path)) { throw 'Case-aliased ZIP inventory' }
            $expected.Add($item.path, $item)
        }
        if ($zip.Entries.Count -ne $expected.Count) { throw 'ZIP entry count mismatch' }
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        # Validate the COMPLETE directory before creating any destination file.
        foreach ($entry in $zip.Entries) {
            Assert-EntryPath $entry.FullName
            if (-not $seen.Add($entry.FullName)) { throw 'Duplicate ZIP entry' }
            if (-not $expected.ContainsKey($entry.FullName)) { throw 'Unknown ZIP entry' }
            $unixType = ($entry.ExternalAttributes -shr 16) -band 0xF000
            if (($unixType -ne 0 -and $unixType -ne 0x8000) -or
                (($entry.ExternalAttributes -band 0x400) -ne 0) -or
                (($entry.ExternalAttributes -band 0x10) -ne 0)) {
                throw 'Nonregular or linked ZIP entry'
            }
            if ($entry.Length -ne $expected[$entry.FullName].bytes) { throw 'ZIP declared length mismatch' }
        }
        if ($Mode -eq 'Extract') {
            if ([string]::IsNullOrEmpty($RootPath) -or [IO.Path]::GetFullPath($RootPath) -cne $RootPath) {
                throw 'Invalid ZIP destination root'
            }
            Assert-Directory $RootPath
            foreach ($entry in $zip.Entries) {
                $item = $expected[$entry.FullName]
                Assert-NativeDecodedEntry $item
                $parts = $entry.FullName.Split('/')
                $parent = $RootPath
                for ($index = 0; $index -lt $parts.Length - 1; $index++) {
                    Assert-Directory $parent
                    $parent = [IO.Path]::Combine($parent, $parts[$index])
                    if (-not [IO.Directory]::Exists($parent)) { [void][IO.Directory]::CreateDirectory($parent) }
                    Assert-Directory $parent
                }
                $destination = [IO.Path]::GetFullPath([IO.Path]::Combine($parent, $parts[-1]))
                if (-not $destination.StartsWith($RootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::Ordinal)) {
                    throw 'ZIP destination escapes root'
                }
                $reader = $entry.Open()
                $writer = $null
                $hash = [Security.Cryptography.IncrementalHash]::CreateHash([Security.Cryptography.HashAlgorithmName]::SHA256)
                try {
                    $writer = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
                    $buffer = [byte[]]::new(65536)
                    [long]$written = 0
                    while ($true) {
                        $remaining = [long]$item.bytes - $written
                        $count = $reader.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining + 1))
                        if ($count -eq 0) { break }
                        $written += $count
                        if ($written -gt $item.bytes) { throw 'ZIP decoded length exceeds declared inventory' }
                        $hash.AppendData($buffer, 0, $count)
                        $writer.Write($buffer, 0, $count)
                    }
                    if ($written -ne $item.bytes) { throw 'ZIP decoded length mismatch' }
                    if ([Convert]::ToHexString($hash.GetHashAndReset()).ToLowerInvariant() -cne $item.sha256) {
                        throw 'ZIP decoded hash mismatch'
                    }
                    $writer.Flush($true)
                } finally {
                    if ($null -ne $writer) { $writer.Dispose() }
                    $reader.Dispose()
                    $hash.Dispose()
                }
            }
        }
        @{ verified = $true; mode = $Mode; entries = $expected.Count } | ConvertTo-Json -Compress
    } finally { $zip.Dispose() }
} finally { $file.Dispose() }
