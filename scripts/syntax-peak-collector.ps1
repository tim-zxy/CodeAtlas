param(
    [Parameter(Mandatory = $true)][string]$NodeExecutable,
    [ValidateSet('short', 'ready')][string]$Mode = 'short'
)
# Node helper acquisition conformance only. No Native binary/Source/profile input.
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathRooted($NodeExecutable) -or [IO.Path]::GetFileName($NodeExecutable) -ine 'node.exe') {
    throw 'Only an explicit Node helper executable is permitted for conformance'
}
Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class SyntaxPeakCounter {
    [StructLayout(LayoutKind.Sequential)]
    private struct Counters {
        public uint cb; public uint PageFaultCount;
        public UIntPtr PeakWorkingSetSize; public UIntPtr WorkingSetSize;
        public UIntPtr QuotaPeakPagedPoolUsage; public UIntPtr QuotaPagedPoolUsage;
        public UIntPtr QuotaPeakNonPagedPoolUsage; public UIntPtr QuotaNonPagedPoolUsage;
        public UIntPtr PagefileUsage; public UIntPtr PeakPagefileUsage;
    }
    [DllImport("psapi.dll", SetLastError = true)]
    private static extern bool GetProcessMemoryInfo(IntPtr process, ref Counters counters, uint size);
    public static ulong Read(IntPtr process) {
        var counters = new Counters(); counters.cb = (uint)Marshal.SizeOf(typeof(Counters));
        if (!GetProcessMemoryInfo(process, ref counters, counters.cb))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        var peak = counters.PeakWorkingSetSize.ToUInt64();
        if (peak == 0) throw new InvalidOperationException("Missing OS lifetime peak");
        return peak;
    }
}
"@
$helper = Join-Path $PSScriptRoot 'syntax-peak-collector-child.mjs'
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $NodeExecutable
# Windows PowerShell/.NET Framework has no ArgumentList. Both arguments are owned,
# the mode is ValidateSet, and a filesystem helper path cannot contain a quote.
if ($helper.Contains('"')) { throw 'Invalid owned helper path' }
$start.Arguments = '"' + $helper + '" ' + $Mode
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.EnvironmentVariables.Clear()
foreach ($name in @('SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP')) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ($null -ne $value) { $start.EnvironmentVariables[$name] = $value }
}
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $start
try {
    $started = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (-not $process.Start()) { throw 'Helper did not start' }
    $ownedHandle = $process.Handle
    $childId = $process.Id
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $samples = @()
    if ($Mode -eq 'ready') {
        $readyTask = $process.StandardOutput.ReadLineAsync()
        if (-not $readyTask.Wait(10000) -or $readyTask.Result -ne 'READY') { throw 'Helper readiness missing' }
        $samples += @{ processId = $childId; epochMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); peakBytes = [SyntaxPeakCounter]::Read($ownedHandle); phase = 'RUNNING' }
        $process.StandardInput.WriteLine('finish')
    }
    $process.StandardInput.Close()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    if (-not $process.WaitForExit(10000)) { throw 'Helper lifetime incomplete' }
    # Query the retained process handle after actual exit: never substitute an
    # earlier poll or another process if the platform refuses this final query.
    $peak = [SyntaxPeakCounter]::Read($ownedHandle)
    $finished = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $samples += @{ processId = $childId; epochMs = $finished; peakBytes = $peak; phase = 'FINAL' }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0 -or $stderr.Length -ne 0 -or $stdout -ne 'DONE') { throw 'Unexpected helper result' }
    @{kind = 'NODE_HELPER_CONFORMANCE_ONLY'; childExitCode = $process.ExitCode; transcript = @{
        schemaVersion = 1; component = 'NATIVE'; processId = $childId; startedEpochMs = $started; finishedEpochMs = $finished;
        peakMethod = 'PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize'; peakUnits = 'bytes'; completeLifetime = $true; samples = @($samples)
    }} | ConvertTo-Json -Depth 8 -Compress
} finally {
    if ($process.Id -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
    $process.Dispose()
}
