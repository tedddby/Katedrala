"""Prototype v2 of the Katedrala M5 module inference design (see design document)."""
from __future__ import annotations

import fnmatch
import math
import sys
from collections import defaultdict

from fixture_graph import Fixture, load
from infer import (CONTAINERS, GENERIC, LAYER_DIRS, SHARED, ancestors, components, dir_kind, dir_of,
                   file_stem, is_within, last_seg, s_stem)
from louvain import louvain, louvain_cpm

P = dict(
    type_only_weight=0.5,
    max_unit_files=120,
    min_stem_coverage=0.25,
    min_recurrent_stems=1,
    utility_min_units=3,
    utility_min_units_shared=2,
    orchestrator_max_own_share=0.25,
    min_support=2,
    min_evidence_weight=1.0,
    stability_resolutions=(0.5, 1.0, 2.0),
    cpm_resolutions=(0.05, 0.1, 0.2),
    weights=dict(cohesion=0.4, margin=0.25, prior=0.2, size=0.15),
    weights_shared={"shared-usage": 0.5, "prior": 0.3, "size": 0.2},
    weights_layer={"cohesion": 0.5, "prior": 0.3, "size": 0.2},
    weights_root={"wiring": 0.3, "prior": 0.5, "size": 0.2},
    size_half=2.0,
)


class Unit:
    def __init__(self, key, anchor_dir, stem, kind, files, origin):
        self.key, self.anchor_dir, self.stem, self.kind = key, anchor_dir, stem, kind
        self.files = set(files)
        self.prior = set(files)  # the prior unit's files (for prior agreement)
        self.origin = origin  # directory | stem | root

    def __repr__(self):
        return f"Unit({self.key},{self.kind},{len(self.files)})"


def owner_pkg(fx, path):
    best = None
    for pkg in fx.packages:
        if is_within(path, pkg) and (best is None or len(pkg) > len(best)):
            best = pkg
    return best


def build_units(scope, pkg):
    direct = defaultdict(list)
    for f in scope:
        direct[dir_of(f)].append(f)
    subtree = defaultdict(int)
    children = defaultdict(set)
    for f in scope:
        d = dir_of(f)
        subtree[d] += 1
        prev = d
        for a in ancestors(d):
            subtree[a] += 1
            children[a].add(prev)
            prev = a
    r = pkg or ""
    while not direct.get(r) and len(children.get(r, ())) == 1:
        r = next(iter(children[r]))
    units, split_dirs = [], []

    def subtree_files(d):
        return [f for f in scope if is_within(dir_of(f), d)]

    def descend(d, is_root):
        name = last_seg(d)
        split = is_root or name.lower() in CONTAINERS or (subtree[d] > P["max_unit_files"] and children.get(d))
        if not split:
            fs = subtree_files(d)
            if fs:
                units.append(Unit(d or ".", d, None, dir_kind(name), fs, "directory"))
            return
        split_dirs.append(d)
        if direct.get(d):
            units.append(Unit(d or ".", d, None, "root" if is_root else "shared", direct[d], "root" if is_root else "directory"))
        for c in sorted(children.get(d, ())):
            descend(c, False)

    descend(r, True)
    return r, units, split_dirs, children


def stems_for(scope, d, layer_kids):
    sub_occ = defaultdict(set)
    for c in layer_kids:
        for f in scope:
            if is_within(f, c) and dir_of(f) != c:
                sub_occ[s_stem(f[len(c) + 1:].split("/")[0])].add(c)
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
    return stem_of


def infer_scope(fx, scope, pkg, w, kinds, log):
    scope_set = set(scope)
    und = defaultdict(set)
    for (s, d) in w:
        if s in scope_set and d in scope_set:
            und[s].add(d)
            und[d].add(s)
    src_root, units, split_dirs, children = build_units(scope, pkg)
    # ---- stem communities (layer-organized sibling groups) -----------------------------------
    for d in split_dirs:
        kids = sorted(children.get(d, ()))
        layer_kids = [c for c in kids if dir_kind(last_seg(c)) == "layer"]
        feature_kids = [c for c in kids if dir_kind(last_seg(c)) == "feature"]
        if len(layer_kids) < 2:
            continue
        stem_of = stems_for(scope, d, layer_kids)
        by_stem = defaultdict(set)
        for f, st in stem_of.items():
            by_stem[st].add(f)
        refined = {}
        for st, mem in sorted(by_stem.items()):
            kept = set()
            for comp in components(mem, und):
                dirs = {next(c for c in layer_kids if is_within(f, c)) for f in comp}
                if len(comp) >= 2 and len(dirs) >= 2:
                    kept |= comp
            if kept:
                refined[st] = kept
        layer_files = [f for f in scope if any(is_within(f, c) for c in layer_kids)]
        covered = set().union(*refined.values()) if refined else set()
        coverage = len(covered) / len(layer_files) if layer_files else 0.0
        organized = len(refined) >= P["min_recurrent_stems"] and coverage >= P["min_stem_coverage"]
        log.append(f"group {d!r}: layer dirs {[last_seg(c) for c in layer_kids]}, recurrent stems "
                   f"{sorted(refined)} cover {len(covered)}/{len(layer_files)} = {coverage:.3f} -> "
                   f"{'stem-organized' if organized else 'directory-organized'}")
        if not organized:
            continue
        for st, comp in sorted(refined.items()):
            for u in units:
                u.files -= comp
                u.prior -= comp
            target = next((u for u in units if u.anchor_dir in feature_kids and s_stem(last_seg(u.anchor_dir)) == st), None)
            if target is not None:
                target.files |= comp
                target.prior |= comp
            else:
                units.append(Unit(f"{d or '.'}#{st}", d, st, "feature", comp, "stem"))
    units = [u for u in units if u.files]
    unit_of = {f: u for u in units for f in u.files}
    prior_of = dict(unit_of)
    root_unit_files = {f for u in units if u.kind == "root" for f in u.files}

    # ---- utilities (pass 0), orchestrators, utilities (final), facades -----------------------
    def utilities_of(excluded):
        found = set()
        for f in sorted(scope):
            if f in excluded:
                continue
            dep_units = {prior_of[s].key for (s, d) in w if d == f and s in scope_set and s not in excluded}
            dep_units.discard(prior_of[f].key)
            u_min = P["utility_min_units_shared"] if prior_of[f].kind in ("shared", "root") else P["utility_min_units"]
            if len(dep_units) >= u_min:
                found.add(f)
        return found

    utilities0 = utilities_of(set())
    orch = set()
    changed = True
    while changed:
        changed = False
        for f in sorted(scope):
            if f in orch or f in utilities0:
                continue
            dependents = [s for (s, d) in w if d == f and s in scope_set and s not in orch]
            outside = [s for s in dependents if prior_of[s] is not prior_of[f]]
            if f in fx.entry_points and not dependents:
                orch.add(f)
                changed = True
                continue
            if outside:
                continue
            out = defaultdict(float)
            for (s, d), wt in w.items():
                if s == f and d in scope_set and d not in utilities0:
                    out[prior_of[d].key] += wt
            total = sum(out.values())
            others = [k for k in out if k != prior_of[f].key]
            own = out.get(prior_of[f].key, 0.0)
            if total == 0 or len(others) < 2 or max(out.values()) > 0.5 * total or own > P["orchestrator_max_own_share"] * total:
                continue
            orch.add(f)
            changed = True
    utilities = utilities_of(orch)
    facades = set()
    for f in scope:
        outs = [kinds[(s, d)] for (s, d) in w if s == f and d in scope_set]
        if outs and sum(1 for k in outs if "re-exports" in k) / len(outs) >= 0.5:
            facades.add(f)
    pinned = orch | utilities | facades

    def evidence(s, d):
        return (s in scope_set and d in scope_set and not ({s, d} & orch) and not ({s, d} & utilities))

    ev = {(s, d): wt for (s, d), wt in w.items() if evidence(s, d)}
    by_key = {u.key: u for u in units}
    moves = []
    for _ in range(50):
        moved = False
        for f in sorted(scope):
            if f in pinned or prior_of[f].kind == "shared":
                continue
            Pu = unit_of[f]
            inc, inc_files, out = defaultdict(float), defaultdict(set), defaultdict(float)
            for (s, d), wt in ev.items():
                if d == f:
                    inc[unit_of[s].key] += wt
                    inc_files[unit_of[s].key].add(s)
                elif s == f:
                    out[unit_of[d].key] += wt
            tin, tout = sum(inc.values()), sum(out.values())
            if tin == 0:
                continue
            best = sorted(inc, key=lambda k: (-inc[k], k))[0]
            C = by_key[best]
            if C is Pu or C.kind != "feature":
                continue
            s_min = P["min_support"] if len(Pu.files) >= 2 else 1
            if (inc[best] > 0.5 * tin and inc[best] >= P["min_evidence_weight"] and len(inc_files[best]) >= s_min
                    and (tout == 0 or out.get(best, 0.0) > 0.5 * tout)):
                Pu.files.discard(f)
                C.files.add(f)
                unit_of[f] = C
                moves.append(dict(file=f, frm=Pu.key, to=C.key, inc=dict(inc), out=dict(out),
                                  support=len(inc_files[best])))
                moved = True
        if not moved:
            break
    units = [u for u in units if u.files]
    return dict(pkg=pkg, src_root=src_root, units=units, orch=orch, utilities=utilities, facades=facades,
                moves=moves, root_unit_files=root_unit_files)


def module_name(fx, res, u):
    if u.origin == "stem":
        return u.stem
    name = last_seg(u.anchor_dir)
    if u.anchor_dir == res["src_root"] and (name.lower() in CONTAINERS or u.anchor_dir == (res["pkg"] or "")):
        pname = fx.package_names.get(res["pkg"], name or "root")
        return pname.split("/")[-1]
    return name


fx_entry = [set()]
EGO = False
CPM = False


def confidence(res, w):
    scope = sorted({f for u in res["units"] for f in u.files})
    idx = {f: i for i, f in enumerate(scope)}
    excluded = res["orch"] | res["utilities"]
    und = defaultdict(float)
    for (s, d), wt in w.items():
        if s in idx and d in idx and s not in excluded and d not in excluded:
            key = (min(idx[s], idx[d]), max(idx[s], idx[d]))
            und[key] += wt
    out = {}
    clusterings = []
    for gamma in (P["cpm_resolutions"] if CPM else P["stability_resolutions"]):
        clusterings.append(louvain_cpm(len(scope), dict(und), resolution=gamma) if CPM else louvain(len(scope), dict(und), resolution=gamma))
    unit_of = {f: u for u in res["units"] for f in u.files}
    for u in res["units"]:
        mem = [idx[f] for f in u.files]
        mset = set(mem)
        sig = {}
        if u.kind in ("feature", "layer"):
            w_in = sum(wt for (a, b), wt in und.items() if a in mset and b in mset)
            cut = sum(wt for (a, b), wt in und.items() if (a in mset) != (b in mset))
            if 2 * w_in + cut > 0:
                sig["cohesion"] = 2 * w_in / (2 * w_in + cut)
            if len(mem) >= 2:
                # ego subgraph: members plus their direct neighbours (orchestrators/utilities excluded)
                nb = set(mset)
                for (a, b) in und:
                    if a in mset:
                        nb.add(b)
                    elif b in mset:
                        nb.add(a)
                ego = sorted(nb)
                loc = {x: i for i, x in enumerate(ego)}
                sub = {(loc[a], loc[b]): wt for (a, b), wt in und.items() if a in loc and b in loc}
                vals = []
                for gi in range(len(clusterings)):
                    cl = clusterings[gi]
                    cnt = defaultdict(int)
                    for i in mem:
                        cnt[cl[i]] += 1
                    pairs = sum(c * (c - 1) / 2 for c in cnt.values())
                    vals.append(pairs / (len(mem) * (len(mem) - 1) / 2))
                sig["structural"] = sum(vals) / len(vals)
                sig["_structural_detail"] = vals
        elif u.kind == "shared":
            shared = 0
            for f in u.files:
                users = {unit_of[s].key for (s, d) in w if d == f and s in unit_of and s not in res["orch"]}
                users.discard(u.key)
                if len(users) >= 2:
                    shared += 1
            sig["shared-usage"] = shared / len(u.files)
        else:  # root
            wiring = sum(1 for f in u.files if f in res["orch"] or f in res["facades"] or f in fx_entry[0])
            sig["wiring"] = wiring / len(u.files)
        if u.kind == "feature":
            margins = []
            for f in sorted(u.files):
                if f in excluded:
                    continue
                for direction in ("in", "out"):
                    acc = defaultdict(float)
                    for (s_, d_), wt in w.items():
                        if s_ in excluded or d_ in excluded or s_ not in unit_of or d_ not in unit_of:
                            continue
                        if direction == "in" and d_ == f:
                            acc[unit_of[s_].key] += wt
                        elif direction == "out" and s_ == f:
                            acc[unit_of[d_].key] += wt
                    tot = sum(acc.values())
                    if tot > 0:
                        own = acc.get(u.key, 0.0) / tot
                        alt = max([v / tot for k, v in acc.items() if k != u.key], default=0.0)
                        margins.append(max(0.0, own - alt))
                        break
            if margins:
                sig["margin"] = sum(margins) / len(margins)
        inter = len(u.files & u.prior)
        union = len(u.files | u.prior)
        sig["prior"] = inter / union if union else 1.0
        n = len(mem)
        sig["size"] = n / (n + P["size_half"])
        weights = (P["weights"] if u.kind == "feature" else P["weights_layer"] if u.kind == "layer"
                   else P["weights_shared"] if u.kind == "shared" else P["weights_root"])
        conf = sum(weights[k] * sig[k] for k in weights if k in sig)
        out[u.key] = (conf, sig, dict(weights))
    return out


def run(fx: Fixture, declared=None):
    declared = declared or {}
    declared_files = {p for p in fx.files for globs in declared.values() for g in globs if fnmatch.fnmatch(p, g)}
    nodes = sorted(p for p, f in fx.files.items() if f.role == "source" and p not in declared_files)
    node_set = set(nodes)
    w, kinds = {}, {}
    for (s, d), e in fx.edges.items():
        if s in node_set and d in node_set and s != d:
            w[(s, d)] = P["type_only_weight"] if e["type_only"] else 1.0
            kinds[(s, d)] = e["kinds"]
    results = []
    for pkg in sorted({owner_pkg(fx, n) or "" for n in nodes}):
        scope = [n for n in nodes if (owner_pkg(fx, n) or "") == pkg]
        log = []
        res = infer_scope(fx, scope, pkg, w, kinds, log)
        res["log"] = log
        fx_entry[0] = fx.entry_points
        res["conf"] = confidence(res, w)
        results.append(res)
    return results, w


def show(fx, results):
    for r in results:
        print(f"--- scope {r['pkg']!r} ({fx.package_names.get(r['pkg'], '-')}) source root {r['src_root']!r}")
        for line in r["log"]:
            print("   ", line)
        print("    orchestrators:", sorted(r["orch"]))
        print("    utilities:", sorted(r["utilities"]))
        print("    facades:", sorted(r["facades"]))
        for m in r["moves"]:
            print(f"    MOVE {m['file']}: {m['frm']} -> {m['to']} in={m['inc']} out={m['out']} support={m['support']}")
        for u in sorted(r["units"], key=lambda u: u.key):
            conf, sig, wts = r["conf"][u.key]
            sigs = ", ".join(f"{k}={v:.3f}" for k, v in sig.items() if not k.startswith("_"))
            det = sig.get("_structural_detail")
            print(f"    mod:{u.key} name={module_name(fx, r, u)!r} kind={u.kind} conf={conf:.3f} [{sigs}]"
                  + (f" struct@gamma={[round(x, 3) for x in det]}" if det else ""))
            print(f"        {sorted(u.files)}")


if __name__ == "__main__":
    for name in sys.argv[1:]:
        fx = load(name)
        print("=" * 30, name)
        decl = {"payments": ["src/payments/*"], "analytics": ["src/analytics/*"]} if name == "dependency-violations" else None
        results, _ = run(fx, decl)
        show(fx, results)
