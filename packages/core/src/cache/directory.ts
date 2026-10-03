/**
 * The default location of the persistent extraction cache.
 */
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

/** What {@link defaultCacheDirectory} consults (defaults: the current process). */
export interface CacheDirectoryEnvironment {
  /** Environment variables (default `process.env`). */
  env?: Readonly<Record<string, string | undefined>>;
  /** Platform (default `process.platform`). */
  platform?: NodeJS.Platform;
  /** The user's home directory (default `os.homedir()`). */
  homeDirectory?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * The user-level cache directory for Katedrala:
 * - `KATEDRALA_CACHE_DIR` when set (resolved to an absolute path);
 * - Windows: `%LOCALAPPDATA%\katedrala\cache` (`<home>\AppData\Local\katedrala\cache` without LOCALAPPDATA);
 * - macOS: `~/Library/Caches/katedrala`;
 * - elsewhere: `$XDG_CACHE_HOME/katedrala` when XDG_CACHE_HOME is an absolute path, else
 *   `~/.cache/katedrala`.
 */
export function defaultCacheDirectory(environment: CacheDirectoryEnvironment = {}): string {
  const env = environment.env ?? process.env;
  const platform = environment.platform ?? process.platform;
  const path = platform === "win32" ? win32 : posix;
  const home = (): string => environment.homeDirectory ?? homedir();

  const explicit = nonEmpty(env.KATEDRALA_CACHE_DIR);
  if (explicit !== undefined) return path.resolve(explicit);
  if (platform === "win32") {
    const localAppData = nonEmpty(env.LOCALAPPDATA) ?? path.join(home(), "AppData", "Local");
    return path.join(localAppData, "katedrala", "cache");
  }
  if (platform === "darwin") return path.join(home(), "Library", "Caches", "katedrala");
  const xdg = nonEmpty(env.XDG_CACHE_HOME);
  if (xdg !== undefined && path.isAbsolute(xdg)) return path.join(xdg, "katedrala");
  return path.join(home(), ".cache", "katedrala");
}
