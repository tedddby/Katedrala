import sys
from collections import defaultdict
from fixture_graph import load
from layers import infer_layers, LOCATION_CONF

W = {"label-agreement": 0.35, "direction-consistency": 0.35, "order-support": 0.2, "size": 0.1}

def noisy_or(cs):
    p = 1.0
    for c in cs:
        p *= (1 - c)
    return 1 - p

for name in sys.argv[1:]:
    fx = load(name)
    label, evidence, removed, rank, w, conventional = infer_layers(fx)
    print("=====", name)
    if not rank:
        print("  none"); continue
    removed_set = {(a, b) for a, b, _ in removed}
    # observed reachability (without conventional arcs, without removed arcs)
    obs = {k for k in w if k not in removed_set}
    def reach(x):
        seen, stack = {x}, [x]
        while stack:
            u = stack.pop()
            for (a, b) in obs:
                if a == u and b not in seen:
                    seen.add(b); stack.append(b)
        return seen
    layers = sorted(rank)
    for L in sorted(layers, key=lambda x: (rank[x], x)):
        members = [f for f, v in label.items() if v == L]
        agree = sum(noisy_or([c for _s, c in evidence[f][0]]) for f in members) / len(members)
        inc = sum(wt for (a, b), wt in w.items() if L in (a, b))
        down = sum(wt for (a, b), wt in w.items() if L in (a, b) and rank[a] < rank[b] and (a, b) not in removed_set)
        sig = {"label-agreement": agree}
        if inc:
            sig["direction-consistency"] = down / inc
        others = [x for x in layers if x != L]
        rl = reach(L)
        comparable_obs = sum(1 for x in others if x in rl or L in reach(x))
        sig["order-support"] = comparable_obs / len(others) if others else 0.0
        n = len(members)
        sig["size"] = n / (n + 2)
        present = [k for k in W if k in sig]
        tw = sum(W[k] for k in present)
        conf = sum(W[k] / tw * sig[k] for k in present)
        print(f"  rank {rank[L]} {L:15s} conf={conf:.3f} " + " ".join(f"{k}={v:.3f}" for k, v in sig.items()))
