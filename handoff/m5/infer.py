"""Prototype of the Katedrala M5 module and layer inference design, run on fixtures.

Not production code: a faithful, compact executable version of the algorithms specified in the design
document, used to check the walk-throughs and the fixture expectations.
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict

from fixture_graph import Fixture, load

TYPE_ONLY_WEIGHT = 0.5
MAX_UNIT_FILES = 120
MIN_SUPPORT = 2
MIN_EVIDENCE_WEIGHT = 1.0
UTILITY_MIN_UNITS = 3
UTILITY_MIN_UNITS_SHARED = 2
ROOT_MAX_OWN_SHARE = 0.25

CONTAINERS = {"src", "source", "sources", "app", "apps", "packages", "features", "feature", "modules",
              "module", "domains", "internal", "pkg", "cmd", "libs"}
SHARED = {"shared", "common", "lib", "util", "utils", "helper", "helpers", "core", "base", "kernel",
          "support", "misc", "tool", "tools", "config", "configuration", "settings", "constant",
          "constants", "type", "types", "interface", "interfaces"}
# directory key -> canonical layer label
LAYER_DIRS = {
    "controller": "controller", "route": "route", "router": "route", "routing": "route",
    "handler": "handler", "resolver": "resolver", "middleware": "middleware", "guard": "middleware",
    "interceptor": "middleware", "view": "view", "page": "page", "screen": "page",
    "component": "component", "presentation": "presentation", "ui": "presentation", "web": "presentation",
    "api": "api", "rest": "api", "graphql": "api", "endpoint": "api", "http": "presentation",
    "service": "service", "usecase": "application", "use-case": "application", "use_case": "application",
    "interactor": "application", "application": "application", "domain": "domain", "model": "model",
    "entity": "model", "schema": "schema", "dto": "dto", "repository": "repository", "repo": "repository",
    "dao": "repository", "persistence": "repository", "db": "database", "database": "database",
    "data": "data", "storage": "storage", "store": "store", "client": "client", "gateway": "gateway",
    "integration": "integration", "adapter": "adapter", "port": "port", "infrastructure": "infrastructure",
    "infra": "infrastructure", "job": "job", "worker": "job", "task": "job", "cron": "job",
    "consumer": "listener", "listener": "listener", "subscriber": "listener", "command": "command",
    "cli": "command", "hook": "hook",
}
ROLE_TOKENS = {"controller", "service", "repository", "repo", "model", "entity", "dto", "module", "route",
               "router", "handler", "resolver", "middleware", "guard", "interceptor", "pipe", "filter",
               "client", "adapter", "store", "schema", "spec", "test", "story", "mock", "fixture", "type",
               "util", "helper", "config", "constant", "enum", "interface", "validator", "mapper",
               "factory", "provider", "job", "worker", "consumer", "listener", "subscriber", "command",
               "query", "view", "page", "component", "container", "hook", "slice", "reducer", "action",
               "selector", "saga", "effect", "style", "d"}
GENERIC = {"index", "main", "app", "server", "mod", "init", "setup", "bootstrap", "base", "abstract",
           "common", "shared", "core", "type", "util", "helper", "constant", "config", "setting",
           "default", "option", "error", "exception", "log", "logger", "event", "message", "request",
           "response", "result", "context"}
MIN_RECURRENT_STEMS = 1
MIN_STEM_COVERAGE = 0.25
# naming-suffix role -> layer label (dotted suffix in file names)
SUFFIX_LAYER = {"controller": "controller", "service": "service", "repository": "repository",
                "routes": "route", "route": "route", "router": "route", "entity": "model", "model": "model",
                "dto": "dto", "middleware": "middleware", "guard": "middleware",
                "interceptor": "middleware", "client": "client", "resolver": "resolver",
                "handler": "handler", "store": "store", "job": "job", "adapter": "adapter"}
# conventional (prior) rank of known layer labels, outer (0) to inner; None = direction-ambiguous
PRIOR_RANK = {"route": 0, "page": 0, "controller": 1, "handler": 1, "resolver": 1, "view": 1,
              "api": 1, "presentation": 1, "middleware": 1, "job": 1, "listener": 1, "command": 1,
              "component": 2, "service": 2, "application": 2, "hook": 2, "store": 2,
              "domain": 3, "repository": 3, "gateway": 3, "client": 3, "database": 4, "storage": 4,
              "data": 4, "model": 4, "dto": 4, "schema": 4}


def s_stem(word: str) -> str:
    """Harman's (1991) S-stemmer plus Katedrala's sibilant extension."""
    w = word.lower()
    if w.endswith("ies") and not (w.endswith("eies") or w.endswith("aies")) and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("es") and not (w.endswith("aes") or w.endswith("ees") or w.endswith("oes")):
        if w.endswith(("sses", "xes", "shes", "zzes")):
            return w[:-2]
        return w[:-1]
    if w.endswith("s") and not (w.endswith("ss") or w.endswith("us")) and len(w) > 3:
        return w[:-1]
    return w


def tokens(name_part: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name_part)
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)
    return [t.lower() for t in re.split(r"[-_. ]+", spaced) if t]


def name_parts(path: str) -> tuple[str, list[str]]:
    base = path.rsplit("/", 1)[-1]
    base = re.sub(r"\.[^.]+$", "", base)  # last extension
    segs = base.split(".")
    return segs[0], [s.lower() for s in segs[1:]]


def file_stem(path: str) -> str | None:
    head, _quals = name_parts(path)
    toks = tokens(head)
    if not toks:
        return None
    first = s_stem(toks[0])
    if first in ROLE_TOKENS or first in GENERIC or len(first) < 2:
        return None
    return first


def dir_of(path: str) -> str:
    return path.rsplit("/", 1)[0] if "/" in path else ""


def ancestors(d: str) -> list[str]:
    out = []
    while d != "":
        d = dir_of(d)
        out.append(d)
    return out


def is_within(path: str, d: str) -> bool:
    return d == "" or path == d or path.startswith(d + "/")


def last_seg(d: str) -> str:
    return d.rsplit("/", 1)[-1] if d else ""


def dir_kind(name: str) -> str:
    k = s_stem(name)
    if k in LAYER_DIRS or name.lower() in LAYER_DIRS:
        return "layer"
    if k in SHARED or name.lower() in SHARED:
        return "shared"
    return "feature"


class Unit:
    def __init__(self, key, anchor_dir, stem, kind, files):
        self.key = key
        self.anchor_dir = anchor_dir
        self.stem = stem
        self.kind = kind
        self.files = set(files)

    def __repr__(self):
        return f"Unit({self.key},{self.kind},{len(self.files)})"


def infer_modules(fx: Fixture, verbose=True):
    nodes = sorted(p for p, f in fx.files.items() if f.role == "source")
    node_set = set(nodes)
    # package scopes: nearest enclosing package root
    def owner_pkg(path):
        best = None
        for pkg in fx.packages:
            if is_within(path, pkg) and (best is None or len(pkg) > len(best)):
                best = pkg
        return best if best is not None else "<none>"

    w = {}
    for (s, d), e in fx.edges.items():
        if s in node_set and d in node_set and s != d:
            w[(s, d)] = TYPE_ONLY_WEIGHT if e["type_only"] else 1.0
    re_export_out = defaultdict(float)
    for (s, d), e in fx.edges.items():
        if s in node_set and d in node_set and "re-exports" in e["kinds"]:
            re_export_out[s] += 1.0

    all_units: list[Unit] = []
    report = {}
    for pkg in sorted({owner_pkg(n) for n in nodes}):
        scope = [n for n in nodes if owner_pkg(n) == pkg]
        units, info = scope_units(scope, pkg)
        res = relocate(scope, units, w, fx, re_export_out, verbose)
        all_units.extend(res)
        report[pkg] = info
    return all_units, report, w


def scope_units(scope: list[str], pkg: str):
    # directories with node files in subtree
    direct = defaultdict(list)
    for f in scope:
        direct[dir_of(f)].append(f)
    subtree_count = defaultdict(int)
    children = defaultdict(set)
    for f in scope:
        d = dir_of(f)
        subtree_count[d] += 1
        prev = d
        for a in ancestors(d):
            subtree_count[a] += 1
            children[a].add(prev)
            prev = a
    root = pkg if pkg != "<none>" else ""
    # source root: descend while no direct files and exactly one child
    r = root
    while not direct.get(r) and len(children.get(r, ())) == 1:
        r = next(iter(children[r]))
    units: list[Unit] = []
    info = {"sourceRoot": r, "groups": []}

    def emit(d, files, kind):
        if files:
            units.append(Unit(d if d else ".", d, None, kind, files))

    def subtree_files(d):
        return [f for f in scope if is_within(dir_of(f), d)]

    split_dirs = []

    def descend(d, is_root):
        name = last_seg(d)
        split = is_root or name.lower() in CONTAINERS or (subtree_count[d] > MAX_UNIT_FILES and children.get(d))
        if not split:
            emit(d, subtree_files(d), dir_kind(name))
            return
        split_dirs.append(d)
        emit(d, direct.get(d, []), "root")
        for c in sorted(children.get(d, ())):
            descend(c, False)

    descend(r, True)
    # stems for layer groups under each split directory
    for d in split_dirs:
        kids = sorted(children.get(d, ()))
        layer_kids = [c for c in kids if dir_kind(last_seg(c)) == "layer"]
        feature_kids = [c for c in kids if dir_kind(last_seg(c)) == "feature"]
        if len(layer_kids) < 2:
            continue
        unit_of_dir = {u.anchor_dir: u for u in units}
        # subdirectory stems that recur across layer dirs
        sub_occ = defaultdict(set)
        for c in layer_kids:
            for f in scope:
                if is_within(f, c) and dir_of(f) != c:
                    sub = f[len(c) + 1:].split("/")[0]
                    sub_occ[s_stem(sub)].add(c)
        stem_of = {}
        for c in layer_kids:
            for f in scope:
                if not is_within(f, c):
                    continue
                if dir_of(f) != c:
                    sub = s_stem(f[len(c) + 1:].split("/")[0])
                    if len(sub_occ[sub]) >= 2 and sub not in GENERIC:
                        stem_of[f] = sub
                        continue
                st = file_stem(f)
                if st:
                    stem_of[f] = st
        occ = defaultdict(set)
        members = defaultdict(set)
        for f, st in stem_of.items():
            c = next(c for c in layer_kids if is_within(f, c))
            occ[st].add(c)
            members[st].add(f)
        recurrent = {st for st, cs in occ.items() if len(cs) >= 2}
        total_layer_files = sum(1 for f in scope if any(is_within(f, c) for c in layer_kids))
        group = {"parent": d, "layerDirs": layer_kids, "featureDirs": feature_kids, "stems": {}}
        for st in sorted(recurrent):
            group["stems"][st] = sorted(members[st])
        info["groups"].append(group)
        info["layerFiles"] = total_layer_files
        info["recurrentFiles"] = sum(len(members[s]) for s in recurrent)
        # connectivity refinement and creation happen in relocate() (needs edges): store candidates
        info.setdefault("stemCandidates", []).append((d, layer_kids, feature_kids, {s: members[s] for s in recurrent}))
    return units, info


def components(nodes: set[str], undirected) -> list[set[str]]:
    seen = set()
    comps = []
    for n in sorted(nodes):
        if n in seen:
            continue
        comp = {n}
        stack = [n]
        seen.add(n)
        while stack:
            x = stack.pop()
            for y in undirected.get(x, ()):
                if y in nodes and y not in seen:
                    seen.add(y)
                    comp.add(y)
                    stack.append(y)
        comps.append(comp)
    return comps


def relocate(scope, units, w, fx, re_export_out, verbose):
    scope_set = set(scope)
    und = defaultdict(set)
    for (s, d) in w:
        if s in scope_set and d in scope_set:
            und[s].add(d)
            und[d].add(s)
    unit_of = {}
    for u in units:
        for f in u.files:
            unit_of[f] = u
    return units  # replaced below by full implementation


def run_modules(fx: Fixture, verbose=True, declared=None):
    declared = declared or {}
    import fnmatch
    declared_files = {p for p in fx.files for globs in declared.values() for g in globs if fnmatch.fnmatch(p, g)}
    nodes = sorted(p for p, f in fx.files.items() if f.role == "source" and p not in declared_files)
    node_set = set(nodes)

    def owner_pkg(path):
        best = None
        for pkg in fx.packages:
            if is_within(path, pkg) and (best is None or len(pkg) > len(best)):
                best = pkg
        return best if best is not None else "<none>"

    w = {}
    kinds = {}
    for (s, d), e in fx.edges.items():
        if s in node_set and d in node_set and s != d:
            w[(s, d)] = TYPE_ONLY_WEIGHT if e["type_only"] else 1.0
            kinds[(s, d)] = e["kinds"]
    results = []
    for pkg in sorted({owner_pkg(n) for n in nodes}):
        scope = [n for n in nodes if owner_pkg(n) == pkg]
        units, info = scope_units(scope, pkg)
        scope_set = set(scope)
        und = defaultdict(set)
        for (s, d) in w:
            if s in scope_set and d in scope_set:
                und[s].add(d)
                und[d].add(s)
        # ---- stem communities -------------------------------------------------------------
        log = []
        for (d, layer_kids, feature_kids, cand) in info.get("stemCandidates", []):
            refined = {}
            for st, mem in sorted(cand.items()):
                kept = set()
                for comp in components(set(mem), und):
                    dirs = {next(c for c in layer_kids if is_within(f, c)) for f in comp}
                    if len(comp) >= 2 and len(dirs) >= 2:
                        kept |= comp
                if kept:
                    refined[st] = kept
            layer_files = [f for f in scope if any(is_within(f, c) for c in layer_kids)]
            covered = set().union(*refined.values()) if refined else set()
            coverage = len(covered) / len(layer_files) if layer_files else 0.0
            organized = len(refined) >= MIN_RECURRENT_STEMS and coverage >= MIN_STEM_COVERAGE
            log.append(f"group {d!r}: {len(refined)} recurrent stems {sorted(refined)} cover {len(covered)}/{len(layer_files)} = {coverage:.2f} -> {'stem-organized' if organized else 'not stem-organized'}")
            if not organized:
                continue
            for st, comp in sorted(refined.items()):
                for u in units:
                    u.files -= comp
                target = next((u for u in units if u.anchor_dir in feature_kids and s_stem(last_seg(u.anchor_dir)) == st), None)
                if target is not None:
                    target.files |= comp
                    log.append(f"stem {st} joined feature directory {target.key}")
                else:
                    key = f"{d if d else '.'}#{st}"
                    units.append(Unit(key, d, st, "feature", comp))
        units = [u for u in units if u.files]
        unit_of = {f: u for u in units for f in u.files}
        root_unit_files = {f for u in units if u.kind == "root" for f in u.files}
        prior_of = dict(unit_of)
        def utilities_of(excluded):
            found = set()
            for f in sorted(scope):
                if f in excluded:
                    continue
                dep_units = {prior_of[s].key for (s, d) in w if d == f and s in scope_set and s not in excluded
                             and s not in root_unit_files}
                dep_units.discard(prior_of[f].key)
                u_min = UTILITY_MIN_UNITS_SHARED if prior_of[f].kind in ("shared", "root") else UTILITY_MIN_UNITS
                if len(dep_units) >= u_min:
                    found.add(f)
            return found
        utilities0 = utilities_of(set())
        # ---- roots (orchestrators) -------------------------------------------------------------
        roots = set()
        changed = True
        while changed:
            changed = False
            for f in sorted(scope):
                if f in roots or f in root_unit_files or f in utilities0:
                    continue
                in_other = sum(wt for (s, d), wt in w.items() if d == f and s in scope_set and s not in roots
                               and s not in root_unit_files and prior_of[s] is not prior_of[f])
                if in_other > 0:
                    continue
                out = defaultdict(float)
                for (s, d), wt in w.items():
                    if s == f and d in scope_set and d not in utilities0 and d not in root_unit_files:
                        out[prior_of[d].key] += wt
                total = sum(out.values())
                others = [k for k in out if k != prior_of[f].key]
                own = out.get(prior_of[f].key, 0.0)
                if total == 0 or len(others) < 2 or max(out.values()) > 0.5 * total or own > ROOT_MAX_OWN_SHARE * total:
                    continue
                roots.add(f)
                changed = True
        # ---- facades ---------------------------------------------------------------------------
        facades = set()
        for f in scope:
            outs = [(d, kinds[(s, d)]) for (s, d) in w if s == f and d in scope_set]
            if outs:
                rx = sum(1 for _d, k in outs if "re-exports" in k)
                if rx / len(outs) >= 0.5:
                    facades.add(f)
        utilities = utilities_of(roots)
        def evidence_edge(s, d):
            return (s in scope_set and d in scope_set and s not in roots and d not in roots
                    and s not in root_unit_files and d not in root_unit_files)
        pinned = roots | utilities | facades | root_unit_files

        def ev(s, d):
            return evidence_edge(s, d) and s not in utilities and d not in utilities

        ev_edges = {(s, d): wt for (s, d), wt in w.items() if ev(s, d)}
        # ---- relocation ---------------------------------------------------------------------------
        moves = []
        for _pass in range(50):
            moved = False
            for f in sorted(scope):
                if f in pinned:
                    continue
                P = unit_of[f]
                inc = defaultdict(float)
                inc_files = defaultdict(set)
                out = defaultdict(float)
                for (s, d), wt in ev_edges.items():
                    if d == f:
                        inc[unit_of[s].key] += wt
                        inc_files[unit_of[s].key].add(s)
                    elif s == f:
                        out[unit_of[d].key] += wt
                tin = sum(inc.values())
                tout = sum(out.values())
                if tin == 0:
                    continue
                best = max(sorted(inc), key=lambda k: inc[k])
                C = next(u for u in units if u.key == best)
                if C is P or C.kind != "feature":
                    continue
                s_min = MIN_SUPPORT if len(P.files) >= 2 else 1
                ok = (inc[best] > 0.5 * tin and inc[best] >= MIN_EVIDENCE_WEIGHT
                      and len(inc_files[best]) >= s_min and (tout == 0 or out.get(best, 0) > 0.5 * tout))
                if ok:
                    P.files.discard(f)
                    C.files.add(f)
                    unit_of[f] = C
                    moves.append((f, P.key, C.key, dict(inc), dict(out)))
                    moved = True
            if not moved:
                break
        units = [u for u in units if u.files]
        results.append({"pkg": pkg, "units": units, "roots": roots, "utilities": utilities,
                        "facades": facades, "moves": moves, "log": log, "info": info})
    return results, w


def print_modules(fx, results):
    for r in results:
        print(f"--- scope {r['pkg']!r} ({fx.package_names.get(r['pkg'], '-')}) sourceRoot={r['info']['sourceRoot']!r}")
        for g in r["info"]["groups"]:
            print(f"    layer group under {g['parent']!r}: layerDirs={g['layerDirs']} featureDirs={g['featureDirs']}")
            for st, mem in g["stems"].items():
                print(f"       recurrent stem {st}: {mem}")
        for line in r["log"]:
            print("    ", line)
        print("    roots:", sorted(r["roots"]))
        print("    utilities:", sorted(r["utilities"]))
        print("    facades:", sorted(r["facades"]))
        for m in r["moves"]:
            print(f"    MOVE {m[0]}: {m[1]} -> {m[2]}  in={m[3]} out={m[4]}")
        for u in sorted(r["units"], key=lambda u: u.key):
            print(f"    module mod:{u.key} [{u.kind}] {sorted(u.files)}")


if __name__ == "__main__":
    for name in sys.argv[1:]:
        fx = load(name)
        print("=" * 30, name)
        decl = {"payments": ["src/payments/*"], "analytics": ["src/analytics/*"]} if name == "dependency-violations" else None
        results, _w = run_modules(fx, declared=decl)
        print_modules(fx, results)
