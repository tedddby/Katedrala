/**
 * Directory tree and language summary of the listed files.
 */
import { baseName, compareStrings, directoryId, fileId, parentPath } from "@katedrala/ir";
import type { DirectoryEntity, FileId, LanguageSummary } from "@katedrala/ir";
import { compareLanguages } from "./order.js";
import type { LinkFile } from "./types.js";

interface DirectoryDraft {
  readonly files: FileId[];
  readonly children: Set<string>;
}

/**
 * Every ancestor directory of every file, plus the analysis root (named after the repository), sorted by id
 * with sorted child directories and files.
 */
export function buildDirectories(
  paths: readonly string[],
  repositoryName: string,
): DirectoryEntity[] {
  const drafts = new Map<string, DirectoryDraft>();
  const ensure = (path: string): DirectoryDraft => {
    let draft = drafts.get(path);
    if (draft === undefined) {
      draft = { files: [], children: new Set() };
      drafts.set(path, draft);
    }
    return draft;
  };
  ensure("");
  for (const path of paths) {
    let directory = parentPath(path);
    ensure(directory).files.push(fileId(path));
    while (directory !== "") {
      const parent = parentPath(directory);
      ensure(parent).children.add(directory);
      directory = parent;
    }
  }
  return [...drafts.entries()]
    .map(([path, draft]): DirectoryEntity => ({
      id: directoryId(path),
      path,
      name: path === "" ? repositoryName : baseName(path),
      ...(path === "" ? {} : { parent: directoryId(parentPath(path)) }),
      directories: [...draft.children].map((child) => directoryId(child)).sort(compareStrings),
      files: [...draft.files].sort(compareStrings),
    }))
    .sort((a, b) => compareStrings(a.id, b.id));
}

/** Files, lines (of files whose content was read) and bytes per language, by descending lines. */
export function languageSummaries(files: readonly LinkFile[]): LanguageSummary[] {
  const summaries = new Map<string, LanguageSummary>();
  for (const file of files) {
    let summary = summaries.get(file.language);
    if (summary === undefined) {
      summary = { language: file.language, files: 0, lines: 0, bytes: 0 };
      summaries.set(file.language, summary);
    }
    summary.files++;
    summary.lines += file.lines ?? 0;
    summary.bytes += file.size;
  }
  return [...summaries.values()].sort(compareLanguages);
}
