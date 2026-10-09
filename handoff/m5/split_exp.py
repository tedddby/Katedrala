"""Experiment: Louvain split of a flattened directory (ambiguous-boundaries with all files in src/)."""
from collections import defaultdict
from fixture_graph import load
from infer import file_stem
from louvain import louvain, relabel

fx = load("ambiguous-boundaries")
nodes = sorted(p for p, f in fx.files.items() if f.role == "source" and p != "src/server.ts")
idx = {f: i for i, f in enumerate(nodes)}
und = defaultdict(float)
utilities = {"src/common/format.ts"}
for (s, d), e in fx.edges.items():
    if s in idx and d in idx and s not in utilities and d not in utilities:
        key = tuple(sorted((idx[s], idx[d])))
        und[key] += 0.5 if e["type_only"] else 1.0
stems = [file_stem(f) or f"~{f}" for f in nodes]
init = relabel(stems)
for label, start in (("stems", init), ("singletons", None)):
    for gamma in (0.5, 1.0, 2.0):
        comm = louvain(len(nodes), dict(und), resolution=gamma, initial=start)
        groups = defaultdict(list)
        for f, c in zip(nodes, comm):
            groups[c].append(f.split("/")[1] + "/" + f.split("/")[2].removesuffix(".ts"))
        # modularity
        m = sum(und.values())
        deg = defaultdict(float); inside = defaultdict(float); tot = defaultdict(float)
        for (a, b), wt in und.items():
            deg[a] += wt; deg[b] += wt
            if comm[a] == comm[b]: inside[comm[a]] += wt
        for i in range(len(nodes)): tot[comm[i]] += deg[i]
        Q = sum(inside[c] / m - gamma * (tot[c] / (2 * m)) ** 2 for c in set(comm))
        Q1 = sum(inside[c] / m - (tot[c] / (2 * m)) ** 2 for c in set(comm))
        print(f"start={label} gamma={gamma}: {len(groups)} communities, Q(gamma)={Q:.3f}, Q(1)={Q1:.3f}")
        for c in sorted(groups, key=lambda c: -len(groups[c])):
            print("    ", sorted(groups[c]))
