/**
 * Components (§2; docs/ALGORITHMS.md, "Components") [DERIVED]: the physical units of a repository, derived
 * from its directory tree and package manifests without judgement. A directory is a component when it holds
 * owned code in its subtree and it is the analysis root, directly contains an owned file, is a package root,
 * or is a branch point (two or more child directories hold owned code). Chains of directories without code
 * collapse into their deepest member, whose name is then the path relative to its parent component
 * (`presentation/http` in clean-architecture).
 *
 * Components carry no `InferenceInfo`: nothing in them is inferred. Their `modules`, `dependencies` and
 * `dependents` are filled later by the pipeline (`infer.ts`), once modules exist and dependencies are
 * aggregated on the metrics projection.
 *
 * Determinism: files and packages are read in identifier order, directories in `compareStrings` order, and
 * the result is sorted by component id; nothing depends on the order of the document's arrays.
 */
import {
  baseName,
  compareStrings,
  componentId,
  parentPath,
  relativePath,
  sortById,
} from "@katedrala/ir";
import type { ComponentId, FileEntity, PackageEntity, PackageId, UnitTotals } from "@katedrala/ir";
import { DirectoryTree } from "./directories.js";
import type { ComponentDraft, ComponentsInput } from "./types.js";

/** A component while it is assembled: its directory, parent and children, and its own files. */
interface ComponentNode {
  readonly path: string;
  readonly parent: ComponentNode | undefined;
  readonly children: ComponentNode[];
  readonly files: readonly FileEntity[];
  readonly totals: UnitTotals;
}

/** Packages per manifest directory, each list sorted by id (several ecosystems may share a directory). */
function packagesByDirectory(
  packages: readonly PackageEntity[],
): ReadonlyMap<string, PackageEntity[]> {
  const byDirectory = new Map<string, PackageEntity[]>();
  for (const pkg of sortById(packages)) {
    const list = byDirectory.get(pkg.path);
    if (list === undefined) byDirectory.set(pkg.path, [pkg]);
    else list.push(pkg);
  }
  return byDirectory;
}

/**
 * Whether a manifest is unnamed (D-12): the IR then names its package after the manifest directory path, or
 * `.` for the analysis root.
 */
function isUnnamed(pkg: PackageEntity): boolean {
  return pkg.name === pkg.path || pkg.name === ".";
}

/**
 * The name of a component (§2.2, D-12, D-13):
 *
 * - a package component: the declared name of its package with the smallest id (D-13); for an unnamed
 *   manifest, the repository name at the analysis root and the directory name elsewhere (D-12);
 * - the analysis root without a manifest: the repository name;
 * - any other directory: its path relative to the parent component, which is the directory name unless
 *   directories without code were collapsed into it (`presentation/http`).
 */
function componentName(
  path: string,
  parent: ComponentNode | undefined,
  declared: readonly PackageEntity[],
  repositoryName: string,
): string {
  const [first] = declared;
  if (first !== undefined) {
    // D-13: several manifests in one directory (different ecosystems): the smallest package id names it.
    if (!isUnnamed(first)) return first.name;
    // D-12: unnamed manifests.
    return path === "" ? repositoryName : baseName(path);
  }
  if (parent === undefined) return repositoryName;
  return relativePath(parent.path, path);
}

/**
 * The packages of a component (§2.2): those declared in its directory (D-13: all of them, sorted by id), else
 * those of the nearest enclosing manifest directory (the package owning the directory), else none.
 */
function componentPackages(
  path: string,
  byDirectory: ReadonlyMap<string, readonly PackageEntity[]>,
): PackageId[] {
  let directory: string | undefined = path;
  while (directory !== undefined) {
    const declared = byDirectory.get(directory);
    if (declared !== undefined) return declared.map((pkg) => pkg.id);
    directory = directory === "" ? undefined : parentPath(directory);
  }
  return [];
}

/**
 * Derive the components of a repository [DERIVED] (§2, plan 4.2):
 *
 * 1. The owned files are the files whose role is in `fileRoles` (`inference.components.file_roles`, by
 *    default declaration, generated, script, source and test), whatever their analysis status: components
 *    are physical, so a directory of unsupported files is still a unit.
 * 2. A directory `d` is a component when its subtree holds an owned file and at least one of these holds:
 *    `d` is the analysis root `""`; `d` directly contains an owned file; `d` is a `PackageEntity.path`; `d`
 *    has at least two child directories holding owned files (a branch point). A package root without owned
 *    files is therefore no component, and a chain of directories without files collapses into its deepest
 *    member.
 * 3. `parent` is the nearest component above, `children` the components whose parent it is (sorted).
 * 4. `kind` is `package` when a manifest is declared in the directory; `name`, `packages` follow D-12 and
 *    D-13; `files` are the owned files directly in the directory (sorted); `totals` sum `files`,
 *    `symbols.length` and `lines ?? 0` over every owned file of the subtree.
 *
 * Every owned file belongs to exactly one component, the one of its own directory. `modules`,
 * `dependencies` and `dependents` are left to the pipeline (`ComponentDraft`). No owned file gives `[]`.
 *
 * Complexity: O(F · D) time for F owned files of depth at most D (the directory tree and the package lookup
 * per component), O(F + directories) memory. Determinism: a pure function of the document; files and
 * packages are read in id order, directories in path order, and the result is sorted by component id.
 */
export function inferComponents(input: ComponentsInput): ComponentDraft[] {
  const { model, fileRoles, repositoryName } = input;
  const owned = sortById(model.document.files.filter((file) => fileRoles.has(file.role)));
  if (owned.length === 0) return [];
  const tree = DirectoryTree.fromPaths(owned.map((file) => file.path));
  const byDirectory = packagesByDirectory(model.document.packages);

  /** §2.2: the four component rules, for a directory whose subtree holds an owned file. */
  const isComponent = (directory: string): boolean =>
    directory === "" ||
    tree.directFiles(directory).length > 0 ||
    byDirectory.has(directory) ||
    tree.children(directory).length >= 2;

  // Depth-first walk in path order with the nearest component above each directory.
  const preorder: ComponentNode[] = [];
  const pending: { readonly directory: string; readonly parent: ComponentNode | undefined }[] = [
    { directory: "", parent: undefined },
  ];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { directory, parent } = next;
    let nearest = parent;
    if (isComponent(directory)) {
      const files = tree.directFiles(directory).flatMap((index) => owned[index] ?? []);
      const node: ComponentNode = {
        path: directory,
        parent,
        children: [],
        files,
        totals: {
          files: files.length,
          symbols: files.reduce((sum, file) => sum + file.symbols.length, 0),
          lines: files.reduce((sum, file) => sum + (file.lines ?? 0), 0),
        },
      };
      parent?.children.push(node);
      preorder.push(node);
      nearest = node;
    }
    // Pushed in reverse, so children are visited in path order.
    const children = tree.children(directory);
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];
      if (child !== undefined) pending.push({ directory: child, parent: nearest });
    }
  }

  // Totals bottom-up: in reverse preorder every component comes after all of its descendants.
  for (let index = preorder.length - 1; index >= 0; index--) {
    const node = preorder[index];
    const parent = node?.parent;
    if (node === undefined || parent === undefined) continue;
    parent.totals.files += node.totals.files;
    parent.totals.symbols += node.totals.symbols;
    parent.totals.lines += node.totals.lines;
  }

  const drafts = preorder.map((node): ComponentDraft => {
    const declared = byDirectory.get(node.path) ?? [];
    // Keys in the order of the IR's ComponentEntity; the root has no parent.
    return {
      id: componentId(node.path),
      name: componentName(node.path, node.parent, declared, repositoryName),
      kind: declared.length > 0 ? "package" : "directory",
      path: node.path,
      packages: componentPackages(node.path, byDirectory),
      ...(node.parent === undefined ? {} : { parent: componentId(node.parent.path) }),
      children: node.children
        .map((child): ComponentId => componentId(child.path))
        .sort(compareStrings),
      files: node.files.map((file) => file.id),
      totals: { ...node.totals },
    };
  });
  return drafts.sort((a, b) => compareStrings(a.id, b.id));
}
