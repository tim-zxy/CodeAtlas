param([Parameter(Mandatory = $true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$items = ConvertFrom-Json -AsHashtable -InputObject ([Console]::In.ReadToEnd())
$file = [IO.File]::Open($ArchivePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
try {
    $zip = [IO.Compression.ZipArchive]::new($file, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($item in $items) {
            # Malformed names/attributes are intentional test inputs, not filesystem paths.
            $entry = $zip.CreateEntry($item.name, [IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
            if ($item.ContainsKey('attributes')) { $entry.ExternalAttributes = [int]$item.attributes }
            $writer = $entry.Open()
            try {
                $bytes = [Convert]::FromBase64String($item.base64)
                $writer.Write($bytes, 0, $bytes.Length)
            } finally { $writer.Dispose() }
        }
    } finally { $zip.Dispose() }
} finally { $file.Dispose() }
