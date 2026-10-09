"""Prototype of the Katedrala M5 layer inference design."""
from __future__ import annotations

import itertools
import re
import sys
from collections import defaultdict

from fixture_graph import load
from infer import LAYER_DIRS, PRIOR_RANK, SHARED, dir_of, is_within, name_parts, s_stem, tokens
from infer2 import build_units, owner_pkg

LOCATION_CONF = 0.7
DOTTED_SUFFIX_CONF = 0.8
WORD_SUFFIX_CONF = 0.6
MIN_LAYER_FILES = 2
MIN_LAYERS = 2
EXACT_MAX = 12

# naming suffix -> role -> layer
SUFFIX_ROLE = {"controller": "http-controller", "service": "service", "repository": "repository",
               "repo": "repository", "routes": "route-definition", "route": "route-definition",
               "router": "route-definition", "entity": "data-model", "model": "data-model",
               "dto": "data-transfer-object", "middleware": "middleware", "guard": "middleware",
               "interceptor": "middleware", "client": "external-client", "module": "module-definition",
               "store": "state-store", "page": "ui-page", "component": "ui-component"}
ROLE_LAYER = {"http-controller": "controller", "route-definition": "route", "middleware": "middleware",
              "service": "service", "repository": "repository", "data-model": "model",
              "data-transfer-object": "dto", "external-client": "client", "ui-page": "page",
              "ui-component": "component", "state-store": "store"}  # module-definition, utility, config: none


def naming_role(path):
    head, quals = name_parts(path)
    for q in reversed(quals):
        if q in SUFFIX_ROLE:
            return SUFFIX_ROLE[q], DOTTED_SUFFIX_CONF, f".{q} suffix"
    toks = tokens(head)
    if len(toks) >= 2 and toks[-1] in SUFFIX_ROLE:
        return SUFFIX_ROLE[toks[-1]], WORD_SUFFIX_CONF, f"-{toks[-1]} word suffix"
    return None


def location_label(path, src_root):
    rel = path[len(src_root) + 1:] if src_root else path
    segs = rel.split("/")[:-1]
    cur = src_root
    for seg in segs:
        cur = f"{cur}/{seg}" if cur else seg
        key = s_stem(seg)
        if key in LAYER_DIRS:
            return LAYER_DIRS[key], cur
        if seg.lower() in LAYER_DIRS:
            return LAYER_DIRS[seg.lower()], cur
    return None


def infer_layers(fx, declared_files=frozenset()):
    nodes = sorted(p for p, f in fx.files.items() if f.role == "source")
    label = {}
    evidence = {}
    source_kind = {}
    pkg_of = {}
    for pkg in sorted({owner_pkg(fx, n) or "" for n in nodes}):
        scope = [n for n in nodes if (owner_pkg(fx, n) or "") == pkg]
        src_root, *_ = build_units(scope, pkg)
        for f in scope:
            loc = location_label(f, src_root)
            nr = naming_role(f)
            nl = ROLE_LAYER.get(nr[0]) if nr else None
            pkg_of[f] = pkg
            if loc:
                label[f] = loc[0]
                source_kind[f] = "location"
                srcs = [("location", LOCATION_CONF)]
                if nl == loc[0]:
                    srcs.append(("naming", nr[1]))
                evidence[f] = (srcs, nl if nl and nl != loc[0] else None)
            elif nl:
                label[f] = nl
                source_kind[f] = "role"
                evidence[f] = ([("naming", nr[1])], None)
    # minimum layer size
    count = defaultdict(int)
    located = defaultdict(int)
    for f, l in label.items():
        count[l] += 1
        if source_kind[f] == "location":
            located[l] += 1
    for f in list(label):
        if located[label[f]] == 0 and count[label[f]] < MIN_LAYER_FILES:
            del label[f]
    labels_by_pkg = defaultdict(set)
    for f, l in label.items():
        labels_by_pkg[pkg_of[f]].add(l)
    layers = sorted(set(label.values()))
    if len(layers) < MIN_LAYERS:
        return {}, {}, [], {}, {}, []
    # layer graph
    w = defaultdict(float)
    pairs = defaultdict(set)
    for (s, d), e in fx.edges.items():
        if s in label and d in label and label[s] != label[d]:
            w[(label[s], label[d])] += 1.0
            pairs[(label[s], label[d])].add((s, d))
    # SCCs (tiny graphs: simple reachability)
    reach = {a: {a} for a in layers}
    changed = True
    while changed:
        changed = False
        for (a, b) in w:
            for x in layers:
                if a in reach[x] and b not in reach[x]:
                    reach[x].add(b)
                    changed = True
    sccs = []
    seen = set()
    for a in layers:
        if a in seen:
            continue
        comp = sorted(b for b in layers if b in reach[a] and a in reach[b])
        seen |= set(comp)
        sccs.append(comp)
    removed = []
    for comp in sccs:
        if len(comp) < 2:
            continue
        # exact minimum-weight ordering (DP over subsets), ties: prior disagreements, then labels
        best = None
        for perm in itertools.permutations(comp):
            pos = {x: i for i, x in enumerate(perm)}
            up = sum(wt for (a, b), wt in w.items() if a in pos and b in pos and pos[a] > pos[b])
            dis = sum(1 for a, b in itertools.combinations(perm, 2)
                      if PRIOR_RANK.get(a) is not None and PRIOR_RANK.get(b) is not None and PRIOR_RANK[a] > PRIOR_RANK[b])
            key = (up, dis, perm)
            if best is None or key < best:
                best = key
        pos = {x: i for i, x in enumerate(best[2])}
        for (a, b) in list(w):
            if a in pos and b in pos and pos[a] > pos[b]:
                removed.append((a, b, w[(a, b)]))
    dag = {k: v for k, v in w.items() if (k[0], k[1], v) not in removed}
    # conventional arcs for incomparable known labels
    def reachable(x, y, edges):
        stack, vis = [x], {x}
        while stack:
            u = stack.pop()
            if u == y:
                return True
            for (a, b) in edges:
                if a == u and b not in vis:
                    vis.add(b)
                    stack.append(b)
        return False
    conventional = []
    for a, b in sorted(itertools.permutations(layers, 2)):
        ra, rb = PRIOR_RANK.get(a), PRIOR_RANK.get(b)
        if ra is None or rb is None or not ra < rb:
            continue
        if not any(a in ls and b in ls for ls in labels_by_pkg.values()):
            continue
        if reachable(a, b, dag) or reachable(b, a, dag):
            continue
        dag[(a, b)] = 0.0
        conventional.append((a, b))
    # longest path from sources
    rank = {}
    def rk(x, stack=()):
        if x in rank:
            return rank[x]
        preds = [a for (a, b) in dag if b == x]
        rank[x] = 0 if not preds else 1 + max(rk(p) for p in preds)
        return rank[x]
    for x in layers:
        rk(x)
    return label, evidence, removed, rank, dict(w), conventional


if __name__ == "__main__":
    for name in sys.argv[1:]:
        fx = load(name)
        label, evidence, removed, rank, w, conventional = infer_layers(fx)
        print("=" * 30, name)
        if not rank:
            print("   no layering inferred")
            continue
        for l in sorted(rank, key=lambda x: (rank[x], x)):
            members = sorted(f for f, v in label.items() if v == l)
            agree = sum(1 for f in members if len(evidence[f][0]) >= 2)
            print(f"   rank {rank[l]} layer:{l} ({len(members)} files, {agree} confirmed by 2 sources): {members}")
        print("   observed layer dependencies:", sorted((a, b) for (a, b) in w))
        print("   upward (removed) arcs:", removed)
        print("   conventional arcs:", conventional)
