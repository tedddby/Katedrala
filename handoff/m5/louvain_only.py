import sys
from collections import defaultdict
from fixture_graph import load
from louvain import louvain
import infer2

for name in sys.argv[1:]:
    fx = load(name)
    results, w = infer2.run(fx)
    for r in results:
        nodes = sorted({f for u in r["units"] for f in u.files})
        excl = r["orch"] | r["utilities"]
        idx = {f: i for i, f in enumerate(nodes)}
        und = defaultdict(float)
        for (s, d), wt in w.items():
            if s in idx and d in idx and s not in excl and d not in excl:
                und[tuple(sorted((idx[s], idx[d])))] += wt
        comm = louvain(len(nodes), dict(und), resolution=1.0)
        groups = defaultdict(list)
        for f, c in zip(nodes, comm):
            groups[c].append(f)
        print("=====", name, r["pkg"], "Louvain(gamma=1) from singletons, orchestrators/utilities excluded:")
        for c in sorted(groups, key=lambda c: (-len(groups[c]), groups[c][0])):
            print("    ", sorted(groups[c]))
