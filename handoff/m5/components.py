import sys
from collections import defaultdict
from fixture_graph import load
from infer import dir_of, ancestors, is_within

OWNED = {"source", "test", "declaration", "script", "generated"}

def components(fx):
    owned = sorted(p for p, f in fx.files.items() if f.role in OWNED)
    direct = defaultdict(list)
    for f in owned:
        direct[dir_of(f)].append(f)
    child_dirs = defaultdict(set)  # directory -> child directories containing owned files in subtree
    for d in list(direct):
        prev = d
        for a in ancestors(d):
            child_dirs[a].add(prev)
            prev = a
    pkgs = set(fx.packages)
    cand = set(direct) | {""} | pkgs | {d for d, c in child_dirs.items() if len(c) >= 2}
    # keep package roots only if they contain owned files (or are the root)
    cand = {d for d in cand if d == "" or any(is_within(f, d) for f in owned)}
    comps = {}
    for d in sorted(cand):
        parent = next((a for a in ancestors(d) if a in cand), None) if d != "" else None
        kind = "package" if d in pkgs else "directory"
        name = fx.package_names[d] if d in pkgs else (d.rsplit("/", 1)[-1] if d else "<repository name>")
        subtree = [f for f in owned if is_within(f, d)] if d else owned
        comps[d] = dict(kind=kind, name=name, parent=parent, files=sorted(direct.get(d, [])), total=len(subtree))
    return comps

for name in sys.argv[1:]:
    fx = load(name)
    print("=====", name)
    for d, c in components(fx).items():
        print(f"  cmp:{d:40s} kind={c['kind']:9s} name={c['name']:18s} parent={'cmp:'+c['parent'] if c['parent'] is not None else '-':28s} direct={len(c['files'])} total={c['total']}")
