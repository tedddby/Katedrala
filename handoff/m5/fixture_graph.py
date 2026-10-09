"""Build an approximate lifted file graph for a Katedrala fixture (prototype for the M5 design).

Edges come from expected.json imports (resolved import statements). Named imports from barrels are
additionally resolved through re-export chains to the declaring files, approximating the linker's
symbol-level edges (calls / references-type with `via`).
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

FIXTURES = r"C:/Users/Awab/Desktop/PROJECTS/Katedrala/fixtures"

CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts")
CONFIG_NAMES = {
    "package.json", "tsconfig.json", "tsconfig.base.json", "babel.config.json", "nest-cli.json",
    "katedrala.config.yaml", "pnpm-workspace.yaml", ".gitignore",
}


@dataclass
class FileInfo:
    path: str
    role: str  # source | test | declaration | configuration | data | other


@dataclass
class Fixture:
    name: str
    files: dict[str, FileInfo]
    packages: list[str]  # package root directories ("" = root)
    package_names: dict[str, str]
    entry_points: set[str]
    # directed edges: (src, dst) -> {"type_only": bool, "kinds": set}
    edges: dict[tuple[str, str], dict] = field(default_factory=dict)


def classify(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    if name in CONFIG_NAMES or name.endswith(".config.json") or name.endswith(".yaml"):
        return "configuration"
    if name.endswith(".d.ts"):
        return "declaration"
    if name.endswith(".json"):
        return "data"
    if not name.endswith(CODE_EXT):
        return "other"
    if re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", name) or path.startswith("test/") or "/test/" in path or "/__tests__/" in path:
        return "test"
    return "source"


def list_files(root: str) -> list[str]:
    out = []
    for dirpath, _dirs, names in os.walk(root):
        for n in names:
            full = os.path.join(dirpath, n)
            rel = os.path.relpath(full, root).replace("\\", "/")
            if rel in ("README.md", "expected.json"):
                continue
            out.append(rel)
    return sorted(out)


IMPORT_RE = re.compile(
    r"(?:^|\n)\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+[\"']([^\"']+)[\"']", re.S
)
DECL_RE = re.compile(
    r"export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)"
)
LOCAL_EXPORT_RE = re.compile(r"export\s+(type\s+)?\{([^}]*)\}\s*(?!from)")


def parse_bindings(clause: str) -> list[tuple[str, bool]]:
    """Named bindings of an import/export clause: [(imported name, typeOnly)]."""
    m = re.search(r"\{([^}]*)\}", clause, re.S)
    if not m:
        return []
    result = []
    for part in m.group(1).split(","):
        part = part.strip()
        if not part:
            continue
        type_only = part.startswith("type ")
        if type_only:
            part = part[5:].strip()
        name = part.split(" as ")[0].strip()
        result.append((name, type_only))
    return result


def load(name: str) -> Fixture:
    root = os.path.join(FIXTURES, name)
    paths = list_files(root)
    files = {p: FileInfo(p, classify(p)) for p in paths}
    packages = sorted({p.rsplit("/", 1)[0] if "/" in p else "" for p in paths if p.endswith("package.json")})
    package_names = {}
    entry_points: set[str] = set()
    for pkg in packages:
        manifest = json.load(open(os.path.join(root, pkg, "package.json"), encoding="utf-8"))
        package_names[pkg] = manifest.get("name") or (pkg or ".")
        candidates = []
        if isinstance(manifest.get("main"), str):
            candidates.append(manifest["main"])
        if isinstance(manifest.get("bin"), dict):
            candidates.extend(manifest["bin"].values())
        for script in (manifest.get("scripts") or {}).values():
            candidates.extend(re.findall(r"(?:src|dist)/[\w./-]+\.(?:ts|js|tsx)", script))
        for c in candidates:
            c = c.removeprefix("./")
            c = re.sub(r"^dist/", "src/", c)
            c = re.sub(r"\.js$", ".ts", c)
            for cand in (c, c.replace(".ts", ".js"), c.replace(".ts", ".tsx")):
                full = f"{pkg}/{cand}" if pkg else cand
                if full in files:
                    entry_points.add(full)
    expected = json.load(open(os.path.join(root, "expected.json"), encoding="utf-8"))
    fx = Fixture(name, files, packages, package_names, entry_points)

    def add(src, dst, type_only, kind):
        e = fx.edges.setdefault((src, dst), {"type_only": True, "kinds": set()})
        e["type_only"] = e["type_only"] and type_only
        e["kinds"].add(kind)

    targets_by_spec: dict[tuple[str, str], str] = {}
    for src, dst, kind in expected["imports"]:
        add(src, dst, kind == "type", "re-exports" if kind == "re-export" else "imports")

    # --- re-export resolution through barrels -------------------------------------------------
    texts = {}
    for p, info in files.items():
        if p.endswith(CODE_EXT) or p.endswith(".d.ts"):
            texts[p] = open(os.path.join(root, p), encoding="utf-8").read()

    def resolve_spec(src: str, spec: str) -> str | None:
        # match against expected imports from src: choose the target whose path best matches the spec
        cands = [d for (s, d) in fx.edges if s == src]
        base = spec.split("/")[-1].removesuffix(".js")
        best = None
        for d in cands:
            stem = d.rsplit("/", 1)[-1]
            stem_noext = re.sub(r"\.(d\.)?[cm]?[jt]sx?$", "", stem)
            parent = d.rsplit("/", 2)[-2] if d.count("/") >= 1 else ""
            if stem_noext == base or (stem_noext == "index" and parent == base) or (base in ("core", "shared") and d.endswith(f"{base}/src/index.ts")):
                best = d
        return best

    exports_cache: dict[str, dict[str, str]] = {}

    def exported_names(path: str, depth=0) -> dict[str, str]:
        """name -> declaring file (following re-exports)."""
        if path in exports_cache:
            return exports_cache[path]
        result: dict[str, str] = {}
        text = texts.get(path, "")
        for m in DECL_RE.finditer(text):
            result[m.group(1)] = path
        for m in LOCAL_EXPORT_RE.finditer(text):
            for n, _t in parse_bindings("{" + m.group(2) + "}"):
                result.setdefault(n, path)
        if depth < 6:
            for m in IMPORT_RE.finditer(text):
                kw, _type, clause, spec = m.groups()
                if kw != "export":
                    continue
                target = resolve_spec(path, spec)
                if target is None:
                    continue
                sub = exported_names(target, depth + 1)
                if clause.strip().startswith("*"):
                    for n, decl in sub.items():
                        result.setdefault(n, decl)
                else:
                    for n, _t in parse_bindings(clause):
                        if n in sub:
                            result.setdefault(n, sub[n])
        exports_cache[path] = result
        return result

    barrels = {s for (s, d), e in fx.edges.items() if "re-exports" in e["kinds"]}
    for src, text in texts.items():
        for m in IMPORT_RE.finditer(text):
            kw, type_kw, clause, spec = m.groups()
            if kw != "import":
                continue
            target = resolve_spec(src, spec)
            if target is None or target not in barrels:
                continue
            names = exported_names(target)
            for n, t_only in parse_bindings(clause):
                decl = names.get(n)
                if decl and decl != target and decl != src:
                    add(src, decl, bool(type_kw) or t_only, "via-re-export")
    return fx


if __name__ == "__main__":
    import sys

    fx = load(sys.argv[1])
    for (s, d), e in sorted(fx.edges.items()):
        print(s, "->", d, "type" if e["type_only"] else "run", sorted(e["kinds"]))
    print("entry points:", sorted(fx.entry_points))
    print("packages:", fx.package_names)
