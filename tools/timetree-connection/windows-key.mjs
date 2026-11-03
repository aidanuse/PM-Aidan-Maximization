import { spawnSync } from "node:child_process";
// DPAPI protects the saved pairing key for this Windows user; never put it in command arguments.
export function protect(value, decrypt = false) {
  if (process.platform !== "win32")
    throw new Error("Run this setup on Windows.");
  const command = decrypt
    ? "$value=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $value; $credential=New-Object System.Net.NetworkCredential -ArgumentList '',$secure; [Console]::Out.Write($credential.Password)"
    : "$value=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $value -AsPlainText -Force; [Console]::Out.Write((ConvertFrom-SecureString -SecureString $secure))";
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { input: value, encoding: "utf8", windowsHide: true, timeout: 15000 },
  );
  if (result.error || result.status !== 0 || !result.stdout.trim())
    throw new Error(
      "Could not protect or read this Windows user’s pairing key.",
    );
  return result.stdout.trim();
}
