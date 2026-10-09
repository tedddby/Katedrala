import sys
from collections import defaultdict
from fixture_graph import load
import infer2
from infer2 import run, P

def detail(name, keys):
    fx = load(name)
    results, w = run(fx)
    for r in results:
        scope = sorted({f for u in r["units"] for f in u.files})
        excluded = r["orch"] | r["utilities"]
        und = defaultdict(float)
        for (s, d), wt in w.items():
            if s in scope and d in scope and s not in excluded and d not in excluded:
                und[tuple(sorted((s, d)))] += wt
        for u in r["units"]:
            if u.key not in keys: continue
            m = u.files
            w_in = sum(wt for (a, b), wt in und.items() if a in m and b in m)
            cut = sum(wt for (a, b), wt in und.items() if (a in m) != (b in m))
            conf, sig, wts = r["conf"][u.key]
            print(name, u.key, "W_in=", w_in, "cut=", cut, "CF=", round(2*w_in/(2*w_in+cut),4) if (2*w_in+cut) else None)
            print("   signals:", {k: round(v,4) if isinstance(v,float) else v for k,v in sig.items()})
            print("   weights:", {k: round(v,4) for k,v in wts.items()}, "conf=", round(conf,4))
            print("   contributions:", {k: round(wts[k]*sig[k],4) for k in wts})
            ext = defaultdict(float)
            for (a, b), wt in und.items():
                if (a in m) != (b in m):
                    other = b if a in m else a
                    ext[other] += wt
            print("   external links:", dict(sorted(ext.items())))

detail(sys.argv[1], set(sys.argv[2:]))
