import copy, random, sys
from fixture_graph import load
import infer2

def confs(fx):
    results, _ = infer2.run(fx)
    out = {}
    for r in results:
        for u in r["units"]:
            out[u.key] = (frozenset(u.files), r["conf"][u.key][0], r["conf"][u.key][1].get("structural"))
    return out

rng = random.Random(7)
for name in sys.argv[1:]:
    fx = load(name)
    base = confs(fx)
    edges = sorted(k for k in fx.edges if fx.files[k[0]].role == "source" and fx.files.get(k[1]) and fx.files[k[1]].role == "source")
    deltas, sdeltas = [], []
    for e in edges:
        f2 = copy.deepcopy(fx); del f2.edges[e]
        new = confs(f2)
        for k, (files, c, s) in base.items():
            if k in new and new[k][0] == files:
                touched = e[0] in files or e[1] in files
                deltas.append((abs(new[k][1] - c), touched))
                if s is not None and new[k][2] is not None:
                    sdeltas.append((abs(new[k][2] - s), touched))
    unt = [d for d, t in deltas if not t]; tou = [d for d, t in deltas if t]
    sunt = [d for d, t in sdeltas if not t]
    print(f"{name:22s} |dconf| untouched modules: mean {sum(unt)/max(1,len(unt)):.4f} max {max(unt) if unt else 0:.3f} | touched: mean {sum(tou)/max(1,len(tou)):.4f} max {max(tou) if tou else 0:.3f} | |dstructural| untouched mean {sum(sunt)/max(1,len(sunt)):.4f} max {max(sunt) if sunt else 0:.3f}")
