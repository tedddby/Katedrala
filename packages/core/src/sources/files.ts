/**
 * Reading files of a working tree without following symbolic links.
 */
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";

/** `O_NOFOLLOW` where the platform has it (not on Windows, where callers rely on a prior `lstat`). */
const OPEN_NO_FOLLOW = (Reflect.get(constants, "O_NOFOLLOW") as number | undefined) ?? 0;

/** Open a file for reading without following a symbolic link in its last component (where supported). */
export function openRegularFile(path: string): Promise<FileHandle> {
  return open(path, constants.O_RDONLY | OPEN_NO_FOLLOW);
}

/** Read a regular file without following a symbolic link in its last component (where supported). */
export async function readRegularFile(path: string): Promise<Uint8Array> {
  const handle = await openRegularFile(path);
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
