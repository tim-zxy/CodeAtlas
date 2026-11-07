import childProcess from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { types } from 'node:util';
import type { captureCompilationInput } from '../../application/dist/capture-compilation-input.js';
type RuntimeRequestControl = Parameters<typeof captureCompilationInput>[1];
import { decodeWindowsProcessPrincipalReply } from './windows-process-principal.js';

// This private binding is for the reviewed local Windows installation only.
// OS updates/different hosts refuse, never become trusted from request hashes.
const hostPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const hostSha256 = '60c9b29843624dd8af6b6a7b26147753be6aeef65098b9a503cc50850afe410f';
const helperHashes = new Set([
  '1cfe23cd44422131131e29fe3eecf7f1c95c3b4281e4d3f06a0a03a4cfa11f25',
  'fd4cad83224e64fdb584444f0e1138ae00353b48a854a73e147b49c0e4b390d6',
]);
const helperUrl = new URL('../../../scripts/windows-process-principal.cs', import.meta.url);
const ownerPid = process.pid;
const incarnation = Object.freeze({});
const arrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bytesLength = Object.getOwnPropertyDescriptor(arrayPrototype, 'byteLength')!.get!;
const bytesOffset = Object.getOwnPropertyDescriptor(arrayPrototype, 'byteOffset')!.get!;
const bytesBuffer = Object.getOwnPropertyDescriptor(arrayPrototype, 'buffer')!.get!;
const principals = new WeakMap<object, RecordState>();
let busy = false;
let poisoned = false;
let uncertain = false;
let principalEpoch = 0;
let processIdentity: { sid: string; creationTimeFileTime: string } | undefined;
interface RecordState {
  incarnation: object;
  pid: number;
  epoch: number;
  sid: string;
  creationTimeFileTime: string;
  closed: boolean;
  check(): void;
  dispose(): void;
}
type FailurePhase =
  | 'CONTROLS'
  | 'HOST_IDENTITY'
  | 'HELPER_IDENTITY'
  | 'TEMP_CREATE'
  | 'CHILD_RUN'
  | 'POST_HOST_IDENTITY'
  | 'CLEANUP'
  | 'REPLY_VALIDATION';
type HelperFailurePhase =
  'BOOTSTRAP' | 'TEMP_ANCESTRY' | 'TEMP_OWNER' | 'COMPILE' | 'QUERY' | 'SERIALIZE' | 'UNAVAILABLE';
interface FailureDiagnostic {
  readonly phase: FailurePhase;
  readonly helperPhase: HelperFailurePhase;
  readonly stderrObserved: boolean;
  readonly stderrTruncated: boolean;
  readonly spawnObserved: boolean;
  readonly childExitCode: number | null;
  readonly childSignalObserved: boolean;
}
const noDiagnostic: FailureDiagnostic = Object.freeze({
  phase: 'CONTROLS',
  helperPhase: 'UNAVAILABLE',
  stderrObserved: false,
  stderrTruncated: false,
  spawnObserved: false,
  childExitCode: null,
  childSignalObserved: false,
});
export class WindowsPrincipalOwnerError extends Error {
  readonly code = 'WINDOWS_PRINCIPAL_UNAVAILABLE';
  constructor(
    readonly cleanupState: 'SETTLED' | 'UNKNOWN' = 'SETTLED',
    readonly diagnostic: Readonly<FailureDiagnostic> = noDiagnostic,
  ) {
    super('Windows principal unavailable');
    this.name = 'WindowsPrincipalOwnerError';
  }
}
function need(value: unknown): asserts value {
  if (!value) throw new WindowsPrincipalOwnerError();
}
function data(value: unknown, keys: string[]): Record<string, unknown> {
  need(
    value &&
      typeof value === 'object' &&
      !types.isProxy(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
  const ds = Object.getOwnPropertyDescriptors(value);
  need(
    Reflect.ownKeys(ds).length === keys.length &&
      keys.every((k) => ds[k] && Object.hasOwn(ds[k]!, 'value')),
  );
  return Object.fromEntries(keys.map((k) => [k, ds[k]!.value]));
}
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
function lifetime(value: RuntimeRequestControl) {
  const c = data(value, ['signal', 'deadlineEpochMs', 'maxItems', 'maxDepth']);
  need(c.signal instanceof AbortSignal && !types.isProxy(c.signal));
  for (const k of ['deadlineEpochMs', 'maxItems', 'maxDepth'])
    need(Number.isSafeInteger(c[k]) && (c[k] as number) > 0);
  const signal = c.signal as AbortSignal,
    deadline = c.deadlineEpochMs as number;
  const duration = deadline - Date.now(),
    started = performance.now();
  need(duration > 0 && !aborted.call(signal));
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  addListener.call(signal, 'abort', stop, { once: true });
  const remaining = () => Math.min(deadline - Date.now(), duration - (performance.now() - started));
  const check = () => {
    if (aborted.call(signal) || remaining() <= 0) stopped = true;
    need(!stopped && process.pid === ownerPid && !poisoned && !uncertain);
  };
  return {
    signal,
    check,
    remaining,
    maxItems: c.maxItems as number,
    maxDepth: c.maxDepth as number,
    dispose: () => removeListener.call(signal, 'abort', stop),
  };
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function verifiedHost(max: number) {
  need((await fs.realpath(hostPath)).toLowerCase() === hostPath.toLowerCase());
  const before = await fs.lstat(hostPath);
  need(before.isFile() && !before.isSymbolicLink() && before.size <= max);
  const bytes = await fs.readFile(hostPath);
  need(bytes.length <= max && hash(bytes) === hostSha256);
  const after = await fs.lstat(hostPath);
  need(after.dev === before.dev && after.ino === before.ino && after.size === before.size);
}
// Fixed program text, not a request script. Source arrives only from the pinned
// application module above. No execution-policy switch, profile or PATH lookup.
const program = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$principalStage='BOOTSTRAP'
try {
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false,$true)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false,$true)
if($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage'){throw 'PRINCIPAL_UNAVAILABLE'}
$inputData=[Console]::In.ReadToEnd()|ConvertFrom-Json
$id=[System.Security.Principal.WindowsIdentity]::GetCurrent()
try{$ownSid=$id.User.Value}finally{$id.Dispose()}
$principalStage='TEMP_ANCESTRY'
$local=[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$known=[IO.Path]::GetFullPath([IO.Path]::Combine($local,'Temp'))
$parent=[IO.DirectoryInfo]::new([string]$inputData.tempParent)
if(-not [String]::Equals($parent.FullName.TrimEnd([char]92),$known.TrimEnd([char]92),[StringComparison]::OrdinalIgnoreCase)){throw 'PRINCIPAL_UNAVAILABLE'}
$windows=[IO.DirectoryInfo]::new([Environment]::GetFolderPath([Environment+SpecialFolder]::Windows))
$platformOwner=$windows.GetAccessControl([Security.AccessControl.AccessControlSections]::Owner).GetOwner([Security.Principal.SecurityIdentifier]).Value
$trusted=@($ownSid,'S-1-5-18','S-1-5-32-544',$platformOwner)
$critical=[Security.AccessControl.FileSystemRights]::WriteData -bor [Security.AccessControl.FileSystemRights]::WriteAttributes -bor [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
$writes=$critical -bor [Security.AccessControl.FileSystemRights]::Write
for($cursor=$parent;$null -ne $cursor;$cursor=$cursor.Parent){
 if(-not $cursor.Exists -or ($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'PRINCIPAL_UNAVAILABLE'}
 $acl=$cursor.GetAccessControl([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner)
 if($trusted -notcontains $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value){throw 'PRINCIPAL_UNAVAILABLE'}
 $mask=if($cursor.FullName -eq $parent.FullName){$writes}else{$critical}
 foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($ace.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){continue}
  $inheritOnly=($ace.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0
  if($inheritOnly -and $ace.IdentityReference.Value -eq 'S-1-3-0'){continue}
  if($cursor.FullName -ne $parent.FullName -and $inheritOnly){continue}
  if(($ace.FileSystemRights -band $mask) -and $trusted -notcontains $ace.IdentityReference.Value){throw 'PRINCIPAL_UNAVAILABLE'}
 }
}
$principalStage='TEMP_OWNER'
$work=[IO.DirectoryInfo]::new([string]$inputData.tempPath)
if(-not $work.Exists -or ($work.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not [String]::Equals($work.Parent.FullName,$parent.FullName,[StringComparison]::OrdinalIgnoreCase)){throw 'PRINCIPAL_UNAVAILABLE'}
$workAcl=$work.GetAccessControl([Security.AccessControl.AccessControlSections]::Owner)
if($workAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $ownSid){throw 'PRINCIPAL_UNAVAILABLE'}
$env:TEMP=[string]$inputData.tempPath;$env:TMP=$env:TEMP
if('WindowsProcessPrincipal' -as [type]){throw 'PRINCIPAL_UNAVAILABLE'}
$principalStage='COMPILE'
$compiled=@(Add-Type -TypeDefinition ([string]$inputData.source) -PassThru -ErrorAction Stop)
$type=@($compiled|Where-Object FullName -eq 'WindowsProcessPrincipal')
if($type.Count -ne 1){throw 'PRINCIPAL_UNAVAILABLE'}
$principalStage='QUERY'
$result=$type[0].GetMethod('Query').Invoke($null,@([long]$inputData.pid,[string]$inputData.challenge))
if($result.sid -cne $ownSid){throw 'PRINCIPAL_UNAVAILABLE'}
$principalStage='SERIALIZE'
$wire=$type[0].GetMethod('Serialize').Invoke($null,@($result))
[Console]::Out.WriteLine([string]$wire)
} catch {
 [Console]::Error.WriteLine('CODEATLAS_PRINCIPAL_FAILURE:'+$principalStage)
 exit 1
}
`;
async function removeOwned(
  directory: string,
  identity: { dev: number; ino: number },
  maxItems: number,
  maxDepth: number,
) {
  const stat = await fs.lstat(directory);
  need(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.dev === identity.dev &&
      stat.ino === identity.ino,
  );
  let count = 0;
  async function checkTree(root: string, depth: number): Promise<void> {
    need(depth <= maxDepth);
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      need(++count <= maxItems && depth + 1 <= maxDepth && !entry.isSymbolicLink());
      const target = path.win32.join(root, entry.name),
        s = await fs.lstat(target);
      need(!s.isSymbolicLink() && s.nlink <= 1);
      if (s.isDirectory()) await checkTree(target, depth + 1);
      else need(s.isFile());
    }
  }
  await checkTree(directory, 0);
  // Exact mkdtemp identity, no externally supplied cleanup path or reparse entries.
  await fs.rm(directory, { recursive: true });
}
/** Actual private bootstrap only: callers supply controls, never SID, image hashes,
 * host/helper paths, a response DTO or a principal construction callback. */
export async function acquireCurrentWindowsPrincipal(
  control: RuntimeRequestControl,
  limits: { readonly maxInputBytes: number; readonly maxOutputBytes: number },
): Promise<object> {
  need(process.platform === 'win32' && process.arch === 'x64' && !busy && !poisoned && !uncertain);
  const sizes = data(limits, ['maxInputBytes', 'maxOutputBytes']);
  for (const n of Object.values(sizes)) need(Number.isSafeInteger(n) && (n as number) > 0);
  const maxInput = sizes.maxInputBytes as number,
    maxOutput = sizes.maxOutputBytes as number;
  const clock = lifetime(control);
  busy = true;
  let phase: FailurePhase = 'HOST_IDENTITY';
  let helperPhase: HelperFailurePhase = 'UNAVAILABLE';
  let stderrObserved = false,
    stderrTruncated = false,
    spawnObserved = false;
  let childExitCode: number | null = null,
    childSignalObserved = false;
  // These fixed diagnostic scalars never participate in admission or cleanup.
  const diagnostic = (): Readonly<FailureDiagnostic> =>
    Object.freeze({
      phase,
      helperPhase,
      stderrObserved,
      stderrTruncated,
      spawnObserved,
      childExitCode,
      childSignalObserved,
    });
  let directory: string | undefined, identity: { dev: number; ino: number } | undefined;
  let created = false,
    normalClose = false,
    background = false;
  try {
    clock.check();
    await verifiedHost(maxInput);
    clock.check();
    phase = 'HELPER_IDENTITY';
    const sourceBytes = await fs.readFile(helperUrl);
    clock.check();
    need(sourceBytes.length <= maxInput && helperHashes.has(hash(sourceBytes)));
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBytes);
    phase = 'TEMP_CREATE';
    const tempParent = os.tmpdir();
    const tempRoot = path.win32.parse(tempParent).root;
    need(
      path.win32.isAbsolute(tempParent) &&
        tempRoot.length === 3 &&
        /^[A-Za-z]:$/.test(tempRoot.slice(0, 2)),
    );
    directory = await fs.mkdtemp(path.win32.join(tempParent, 'codeatlas-principal-'));
    const stat = await fs.lstat(directory);
    need(stat.isDirectory() && !stat.isSymbolicLink());
    identity = { dev: stat.dev, ino: stat.ino };
    clock.check();
    const challenge = randomUUID();
    const input = Buffer.from(
      JSON.stringify({ pid: ownerPid, challenge, source, tempParent, tempPath: directory }),
    );
    need(input.length <= maxInput);
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', program];
    phase = 'CHILD_RUN';
    const child = childProcess.spawn(hostPath, args, {
      shell: false,
      windowsHide: true,
      cwd: path.win32.dirname(hostPath),
      env: {
        SYSTEMROOT: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        SYSTEMDRIVE: 'C:',
        PATH: '',
        PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',
        TEMP: directory,
        TMP: directory,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    created = true;
    need(child.stdin && child.stdout && child.stderr);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stderrBytes = 0;
    const stderrDiagnosticLimit = 96;
    let count = 0,
      spawnSeen = false,
      outEnd = false,
      errEnd = false,
      inputEnd = false,
      bad = false,
      stopped = false;
    let rejectStopped: (e: Error) => void = () => {};
    const stoppedPromise = new Promise<never>((_resolve, reject) => {
      rejectStopped = reject;
    });
    const stop = () => {
      if (!stopped) {
        stopped = true;
        uncertain = true;
        principalEpoch++;
        rejectStopped(new WindowsPrincipalOwnerError('UNKNOWN'));
      }
    };
    const abort = () => stop();
    addListener.call(clock.signal, 'abort', abort, { once: true });
    const timer = setTimeout(stop, Math.max(0, Math.min(2147483647, clock.remaining())));
    const done = new Promise<void>((resolve, reject) => {
      child.once('spawn', () => {
        spawnSeen = true;
        spawnObserved = true;
        if (!child.pid || child.spawnfile !== hostPath) bad = true;
      });
      child.once('error', () => {
        bad = true;
      });
      child.stdout!.on('data', (bytes: Buffer) => {
        try {
          need(bytes && !types.isProxy(bytes) && bytes instanceof Uint8Array);
          const storage = bytesBuffer.call(bytes),
            length = bytesLength.call(bytes);
          need(!(storage instanceof SharedArrayBuffer));
          count += length;
          need(count <= maxOutput);
          if (!stopped)
            stdout.push(Buffer.from(new Uint8Array(storage, bytesOffset.call(bytes), length)));
        } catch {
          bad = true;
          stop();
        }
      });
      child.stderr!.on('data', (bytes: Buffer) => {
        try {
          need(bytes && !types.isProxy(bytes) && bytes instanceof Uint8Array);
          const storage = bytesBuffer.call(bytes),
            length = bytesLength.call(bytes);
          need(!(storage instanceof SharedArrayBuffer));
          if (!length) return;
          bad = true;
          stderrObserved = true;
          if (length > stderrDiagnosticLimit - stderrBytes) {
            stderrTruncated = true;
            stderr.length = 0;
          } else if (!stderrTruncated) {
            stderrBytes += length;
            stderr.push(Buffer.from(new Uint8Array(storage, bytesOffset.call(bytes), length)));
          }
        } catch {
          bad = true;
          stderrObserved = true;
          stderrTruncated = true;
          stderr.length = 0;
        }
      });
      child.stdout!.once('end', () => {
        outEnd = true;
      });
      child.stderr!.once('end', () => {
        errEnd = true;
      });
      child.stdout!.once('error', () => {
        bad = true;
      });
      child.stderr!.once('error', () => {
        bad = true;
      });
      child.stdin!.once('finish', () => {
        inputEnd = true;
      });
      child.stdin!.once('error', () => {
        bad = true;
      });
      child.once('close', (code, signal) => {
        childExitCode =
          Number.isInteger(code) && code! >= -2147483648 && code! <= 2147483647 ? code : null;
        childSignalObserved = signal !== null;
        if (!stderrTruncated) {
          const text = Buffer.concat(stderr).toString('utf8');
          const match =
            /^CODEATLAS_PRINCIPAL_FAILURE:(BOOTSTRAP|TEMP_ANCESTRY|TEMP_OWNER|COMPILE|QUERY|SERIALIZE)\r?\n$/.exec(
              text,
            );
          // Full-input match: JS $ alone can also match before a trailing newline.
          if (match && match[0].length === text.length)
            helperPhase = match[1] as HelperFailurePhase;
        }
        stderr.length = 0;
        normalClose = spawnSeen && code === 0 && signal === null && outEnd && errEnd && inputEnd;
        clearTimeout(timer);
        removeListener.call(clock.signal, 'abort', abort);
        if (normalClose) resolve();
        else reject(new WindowsPrincipalOwnerError('UNKNOWN'));
      });
      child.stdin!.end(input);
    });

    if (aborted.call(clock.signal) || clock.remaining() <= 0) stop();
    try {
      await Promise.race([done, stoppedPromise]);
    } catch (error) {
      if (stopped && !normalClose) {
        background = true;
        // No principal escapes. Retain ownership and block new lookups until actual
        // normal close plus exact owned cleanup; abnormal exit poisons this process.
        void done
          .then(
            async () => {
              await removeOwned(directory!, identity!, clock.maxItems, clock.maxDepth);
              directory = undefined;
              busy = false;
              uncertain = false;
            },
            () => {
              poisoned = true;
            },
          )
          .catch(() => {
            poisoned = true;
          })
          .finally(() => clock.dispose());
      }
      throw error;
    }
    need(!bad && !stopped);
    clock.check();
    phase = 'POST_HOST_IDENTITY';
    await verifiedHost(maxInput);
    clock.check();
    phase = 'CLEANUP';
    await removeOwned(directory, identity, clock.maxItems, clock.maxDepth);
    directory = undefined;
    clock.check();
    phase = 'REPLY_VALIDATION';
    const reply = decodeWindowsProcessPrincipalReply(
      Buffer.concat(stdout),
      { pid: ownerPid, challenge },
      maxOutput,
    );
    need(reply.pid === process.pid);
    if (
      processIdentity &&
      (processIdentity.sid !== reply.sid ||
        processIdentity.creationTimeFileTime !== reply.creationTimeFileTime)
    ) {
      poisoned = true;
      throw new WindowsPrincipalOwnerError();
    }
    processIdentity ??= { sid: reply.sid, creationTimeFileTime: reply.creationTimeFileTime };
    const handle = Object.freeze(Object.create(null)) as object;
    const record: RecordState = {
      incarnation,
      pid: ownerPid,
      epoch: principalEpoch,
      sid: reply.sid,
      creationTimeFileTime: reply.creationTimeFileTime,
      closed: false,
      check: clock.check,
      dispose: clock.dispose,
    };
    principals.set(handle, record);
    busy = false;
    return handle;
  } catch (error) {
    if (!background) {
      if (created && !normalClose) poisoned = true;
      if (directory) {
        // No recursive deletion before the fixed helper has authenticated the
        // complete temp ancestry. A pre-spawn stop retains the owned path UNKNOWN.
        if (!created || !normalClose || !identity) poisoned = true;
        else {
          try {
            await removeOwned(directory, identity, clock.maxItems, clock.maxDepth);
          } catch {
            poisoned = true;
          }
        }
      }
      clock.dispose();
      busy = false;
      if (!poisoned && (!created || normalClose)) uncertain = false;
    }
    throw new WindowsPrincipalOwnerError(
      background || poisoned ? 'UNKNOWN' : 'SETTLED',
      diagnostic(),
    );
  }
}
export function assertCurrentWindowsPrincipal(handle: object): void {
  need(handle && typeof handle === 'object' && !types.isProxy(handle));
  const record = principals.get(handle);
  need(
    record &&
      !record.closed &&
      record.incarnation === incarnation &&
      record.epoch === principalEpoch &&
      record.pid === process.pid &&
      record.sid === processIdentity?.sid &&
      record.creationTimeFileTime === processIdentity?.creationTimeFileTime,
  );
  record.check();
}
export function releaseCurrentWindowsPrincipal(handle: object): void {
  need(handle && typeof handle === 'object' && !types.isProxy(handle));
  const record = principals.get(handle);
  need(record);
  if (!record.closed) {
    record.closed = true;
    record.dispose();
  }
}
