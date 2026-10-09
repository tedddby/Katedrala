"""Ego-local structural stability signal: Louvain at gamma in {0.5,1,2} on the induced subgraph of
members + neighbours (evidence graph), pair co-assignment of members. Values and single-edge drift."""
import copy, sys
from collections import defaultdict
from fixture_graph import load
import infer2
from louvain import louvain

GAMMAS = (0.5, 1.0, 2.0)

def ego_struct(fx):
    results, w = infer2.run(fx)
    out = {}
    for r in results:
        excl = r["orch"] | r["utilities"]
        scope = sorted({f for u in r["units"] for f in u.files})
        sset = set(scope)
        und = defaultdict(float)
        for (s, d), wt in w.items():
            if s in sset and d in sset and s not in excl and d not in excl:
                und[tuple(sorted((s, d)))] += wt
        nb = defaultdict(set)
        for (a, b) in und:
            nb[a].add(b); nb[b].add(a)
        for u in r["units"]:
            mem = sorted(f for f in u.files if f not in excl)
            if len(mem) < 2:
                out[u.key] = (frozenset(u.files), None); continue
            ego = set(mem)
            for f in mem: ego |= nb[f]
            ego = sorted(ego); loc = {x: i for i, x in enumerate(ego)}
            sub = {(loc[a], loc[b]): wt for (a, b), wt in und.items() if a in loc and b in loc}
            vals = []
            for g in GAMMAS:
                cl = louvain(len(ego), dict(sub), resolution=g)
                cnt = defaultdict(int)
                for f in mem: cnt[cl[loc[f]]] += 1
                vals.append(sum(c*(c-1)/2 for c in cnt.values()) / (len(mem)*(len(mem)-1)/2))
            out[u.key] = (frozenset(u.files), sum(vals)/len(vals), vals)
    return out

for name in sys.argv[1:]:
    fx = load(name)
    base = ego_struct(fx)
    for k, v in sorted(base.items()):
        if v[1] is not None: print(f"  {name} {k}: ego-structural={v[1]:.3f} {[round(x,3) for x in v[2]]}")
    edges = sorted(k for k in fx.edges if fx.files[k[0]].role == "source" and fx.files.get(k[1]) and fx.files[k[1]].role == "source")
    unt, tou = [], []
    for e in edges:
        f2 = copy.deepcopy(fx); del f2.edges[e]
        new = ego_struct(f2)
        for k, v in base.items():
            if v[1] is None or k not in new or new[k][0] != v[0] or new[k][1] is None: continue
            (tou if (e[0] in v[0] or e[1] in v[0]) else unt).append(abs(new[k][1]-v[1]))
    print(f"{name:22s} |dstructural(ego)| untouched mean {sum(unt)/max(1,len(unt)):.4f} max {max(unt) if unt else 0:.3f} | touched mean {sum(tou)/max(1,len(tou)):.4f} max {max(tou) if tou else 0:.3f}")
