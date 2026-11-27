import { spawn } from 'node:child_process';

/*
 * The agy CLI keeps its single Google login in the OS keyring (service "gemini", account
 * "antigravity"). An agy profile is a saved copy of that entry (blueprint AGENT_BRIDGE/02).
 * Ported from Gungnir's remediate/keyring_*.go. Secrets travel through env/stdin, never argv.
 */

const SERVICE = 'gemini';
const ACCOUNT = 'antigravity';

/** Windows Credential Manager through PowerShell + P/Invoke; the script is constant, data comes in env. */
const WIN_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class ArchaCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL { public uint Flags; public uint Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;
    public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredReadW(string t, uint type, uint f, out IntPtr c);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWriteW(ref CREDENTIAL c, uint f);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDeleteW(string t, uint type, uint f);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr c);
  public static string Read(string t) {
    IntPtr p; if (!CredReadW(t, 1, 0, out p)) { if (Marshal.GetLastWin32Error() == 1168) return "NONE"; throw new Exception("CredRead failed: " + Marshal.GetLastWin32Error()); }
    try { var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL)); var b = new byte[c.CredentialBlobSize]; Marshal.Copy(c.CredentialBlob, b, 0, b.Length); return Convert.ToBase64String(b); }
    finally { CredFree(p); }
  }
  public static void Write(string t, string user, string b64) {
    var b = Convert.FromBase64String(b64); var mem = Marshal.AllocHGlobal(b.Length);
    try { Marshal.Copy(b, 0, mem, b.Length);
      var c = new CREDENTIAL { Type = 1, TargetName = t, CredentialBlobSize = (uint)b.Length, CredentialBlob = mem, Persist = 2, UserName = user };
      if (!CredWriteW(ref c, 0)) throw new Exception("CredWrite failed: " + Marshal.GetLastWin32Error()); }
    finally { Marshal.FreeHGlobal(mem); }
  }
  public static void Delete(string t) { if (!CredDeleteW(t, 1, 0) && Marshal.GetLastWin32Error() != 1168) throw new Exception("CredDelete failed: " + Marshal.GetLastWin32Error()); }
}
'@
$t = $env:ARCHA_CRED_TARGET
switch ($env:ARCHA_CRED_OP) {
  'read' { [Console]::Out.Write([ArchaCred]::Read($t)) }
  'write' { [ArchaCred]::Write($t, $env:ARCHA_CRED_USER, $env:ARCHA_CRED_B64); [Console]::Out.Write('OK') }
  'delete' { [ArchaCred]::Delete($t); [Console]::Out.Write('OK') }
}
`;

function run(bin: string, args: string[], env: Record<string, string>, stdin?: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true, env: { ...process.env, ...env } });
    let out = '', err = '';
    child.stdout.setEncoding('utf8').on('data', (c: string) => { out += c; });
    child.stderr.setEncoding('utf8').on('data', (c: string) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
    child.stdin.end(stdin ?? '');
  });
}

async function windows(op: 'read' | 'write' | 'delete', blob?: Buffer): Promise<string> {
  const encoded = Buffer.from(WIN_SCRIPT, 'utf16le').toString('base64');
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    ARCHA_CRED_OP: op, ARCHA_CRED_TARGET: `${SERVICE}:${ACCOUNT}`, ARCHA_CRED_USER: ACCOUNT, ARCHA_CRED_B64: blob?.toString('base64') ?? '',
  });
  if (r.code !== 0) throw new Error(lastLine(r.err) || `Credential Manager ${op} failed`);
  return r.out.trim();
}

/** The host's agy login, or null when agy is not signed in. */
export async function keyringRead(): Promise<Buffer | null> {
  if (process.platform === 'win32') {
    const out = await windows('read');
    return out === 'NONE' || !out ? null : Buffer.from(out, 'base64');
  }
  if (process.platform === 'darwin') {
    const r = await run('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'], {});
    return r.code === 0 && r.out.trim() ? Buffer.from(r.out.trim(), 'utf8') : null;
  }
  const r = await run('secret-tool', ['lookup', 'service', SERVICE, 'account', ACCOUNT], {});
  return r.code === 0 && r.out ? Buffer.from(r.out, 'utf8') : null;
}

export async function keyringWrite(blob: Buffer): Promise<void> {
  if (!blob.length) throw new Error('Empty agy credential');
  if (process.platform === 'win32') { await windows('write', blob); return; }
  if (process.platform === 'darwin') {
    // `security` has no stdin mode for the secret; it is visible to this user's process list briefly.
    const r = await run('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT, '-w', blob.toString('utf8')], {});
    if (r.code !== 0) throw new Error(lastLine(r.err) || 'Keychain write failed');
    return;
  }
  const r = await run('secret-tool', ['store', '--label=antigravity', 'service', SERVICE, 'account', ACCOUNT], {}, blob.toString('utf8'));
  if (r.code !== 0) throw new Error(lastLine(r.err) || 'secret-tool store failed');
}

export async function keyringDelete(): Promise<void> {
  if (process.platform === 'win32') { await windows('delete'); return; }
  if (process.platform === 'darwin') { await run('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT], {}); return; }
  await run('secret-tool', ['clear', 'service', SERVICE, 'account', ACCOUNT], {});
}

function lastLine(text: string): string {
  return text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
}
