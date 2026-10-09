"""Single-edge perturbation stability: prior-anchored inference vs. Louvain from singletons."""
import copy
import random
import sys
from collections import defaultdict
from fixture_graph import load
import infer2
from louvain import louvain

def partition_infer(fx):
    results, _ = infer2.run(fx)
    return {f: u.key for r in results for u in r["units"] for f in u.files}

def partition_louvain(fx):
    nodes = sorted(p for p, f in fx.files.items() if f.role == "source")
    idx = {f: i for i, f in enumerate(nodes)}
    und = defaultdict(float)
    for (s, d), e in fx.edges.items():
        if s in idx and d in idx and s != d:
            und[tuple(sorted((idx[s], idx[d])))] += 0.5 if e["type_only"] else 1.0
    comm = louvain(len(nodes), dict(und), resolution=1.0)
    return {f: comm[i] for f, i in idx.items()}

def changed(a, b):
    """files not in their matched cluster after a greedy maximum-overlap matching (a MoJo-like move count)."""
    common = sorted(set(a) & set(b))
    ga, gb = defaultdict(set), defaultdict(set)
    for f in common:
        ga[a[f]].add(f); gb[b[f]].add(f)
    pairs = sorted(((len(ga[x] & gb[y]), str(x), str(y)) for x in ga for y in gb if ga[x] & gb[y]), reverse=True)
    used_a, used_b, kept = set(), set(), 0
    for ov, x, y in pairs:
        if x in used_a or y in used_b: continue
        used_a.add(x); used_b.add(y); kept += ov
    return len(common) - kept

def changed_old(a, b):
    """files whose co-membership changed: count files f with differing sets of co-members (restricted to common files)."""
    common = sorted(set(a) & set(b))
    return 0

rng = random.Random(42)
for name in sys.argv[1:]:
    fx = load(name)
    base_i, base_l = partition_infer(fx), partition_louvain(fx)
    edges = sorted(k for k in fx.edges if fx.files.get(k[0]) and fx.files[k[0]].role == "source" and fx.files.get(k[1]) and fx.files[k[1]].role == "source")
    nodes = sorted(p for p, f in fx.files.items() if f.role == "source")
    res = {"remove": ([], []), "add": ([], [])}
    for e in edges:
        f2 = copy.deepcopy(fx); del f2.edges[e]
        res["remove"][0].append(changed(base_i, partition_infer(f2)))
        res["remove"][1].append(changed(base_l, partition_louvain(f2)))
    for _ in range(40):
        s, d = rng.sample(nodes, 2)
        if (s, d) in fx.edges: continue
        f2 = copy.deepcopy(fx); f2.edges[(s, d)] = {"type_only": False, "kinds": {"imports"}}
        res["add"][0].append(changed(base_i, partition_infer(f2)))
        res["add"][1].append(changed(base_l, partition_louvain(f2)))
    for kind, (a, b) in res.items():
        print(f"{name:24s} {kind:6s} n={len(a):3d}  katedrala: mean {sum(a)/len(a):.2f} max {max(a)} zero {sum(1 for x in a if x==0)/len(a):.0%} | louvain: mean {sum(b)/len(b):.2f} max {max(b)} zero {sum(1 for x in b if x==0)/len(b):.0%}")
