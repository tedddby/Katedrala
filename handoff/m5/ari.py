import sys
from math import comb
from collections import defaultdict
from fixture_graph import load
import infer2
from infer import dir_of

def ari(a, b):
    keys = sorted(set(a) & set(b))
    n = len(keys)
    cont = defaultdict(int); ra = defaultdict(int); rb = defaultdict(int)
    for k in keys:
        cont[(a[k], b[k])] += 1; ra[a[k]] += 1; rb[b[k]] += 1
    index = sum(comb(v, 2) for v in cont.values())
    sa = sum(comb(v, 2) for v in ra.values()); sb = sum(comb(v, 2) for v in rb.values())
    expected = sa * sb / comb(n, 2) if n > 1 else 0
    mx = (sa + sb) / 2
    return (index - expected) / (mx - expected) if mx != expected else 1.0

for name in sys.argv[1:]:
    fx = load(name)
    results, _ = infer2.run(fx)
    inferred = {f: u.key for r in results for u in r["units"] for f in u.files}
    directory = {f: dir_of(f) for f in inferred}
    print(f"{name:24s} ARI(inferred modules, directories) = {ari(inferred, directory):.3f}  modules={len(set(inferred.values()))} directories={len(set(directory.values()))}")
