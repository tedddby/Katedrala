"""Python port of @katedrala/graph louvain() (deterministic Louvain + connected refinement)."""
from __future__ import annotations


def louvain(n: int, edges: dict[tuple[int, int], float], resolution=1.0, initial=None,
            max_levels=10**9, min_gain=1e-12, min_pass_gain=1e-7):
    # undirected adjacency (u<v keys), self loops allowed (u==v)
    def build(nn, ed):
        adj = [dict() for _ in range(nn)]
        for (a, b), wt in ed.items():
            if a == b:
                adj[a][a] = adj[a].get(a, 0.0) + wt
            else:
                adj[a][b] = adj[a].get(b, 0.0) + wt
                adj[b][a] = adj[b].get(a, 0.0) + wt
        return adj

    adj0 = build(n, edges)
    m = sum(edges.values())
    two_m = 2 * m
    membership = list(range(n))
    start = None if initial is None else relabel(initial)
    levels = 0
    if two_m > 0:
        adj = adj0
        nn = n
        while levels < max_levels:
            comm = start if start is not None else list(range(nn))
            start = None
            local_moving(adj, comm, two_m, resolution, min_gain * m, min_pass_gain * m)
            levels += 1
            comm = relabel(comm)
            count = max(comm) + 1 if comm else 0
            membership = [comm[membership[v]] for v in range(n)]
            if count == nn:
                break
            # aggregate
            agg = {}
            for i in range(nn):
                for j, wt in adj[i].items():
                    if j < i:
                        continue
                    a, b = comm[i], comm[j]
                    key = (min(a, b), max(a, b))
                    agg[key] = agg.get(key, 0.0) + wt
            adj = build(count, agg)
            nn = count
    elif start is not None:
        membership = list(start)
    return connected_refinement(n, adj0, membership)


def relabel(labels):
    ids = {}
    out = []
    for x in labels:
        if x not in ids:
            ids[x] = len(ids)
        out.append(ids[x])
    return out


def local_moving(adj, comm, two_m, resolution, move_threshold, pass_threshold):
    n = len(adj)
    strength = [sum((2 * wt if j == i else wt) for j, wt in adj[i].items()) for i in range(n)]
    total = [0.0] * n
    for i in range(n):
        total[comm[i]] += strength[i]
    factor = resolution / two_m
    for _ in range(1000):
        moved = False
        pass_gain = 0.0
        for i in range(n):
            cur = comm[i]
            k = strength[i]
            link = {}
            for j, wt in sorted(adj[i].items()):
                if j == i:
                    continue
                link[comm[j]] = link.get(comm[j], 0.0) + wt
            total[cur] -= k
            stay = link.get(cur, 0.0) - factor * k * total[cur]
            best, best_gain = cur, stay
            for c in sorted(link):
                if c == cur:
                    continue
                g = link[c] - factor * k * total[c]
                if g > best_gain + move_threshold:
                    best, best_gain = c, g
            total[best] += k
            if best != cur:
                comm[i] = best
                moved = True
                pass_gain += best_gain - stay
        if not moved or pass_gain <= pass_threshold:
            break


def connected_refinement(n, adj, membership):
    result = [-1] * n
    nxt = 0
    for root in range(n):
        if result[root] != -1:
            continue
        cid = nxt
        nxt += 1
        c = membership[root]
        result[root] = cid
        queue = [root]
        h = 0
        while h < len(queue):
            v = queue[h]
            h += 1
            for w_ in sorted(adj[v]):
                if result[w_] != -1 or membership[w_] != c:
                    continue
                result[w_] = cid
                queue.append(w_)
    return result


def louvain_cpm(n: int, edges: dict[tuple[int, int], float], resolution: float, max_levels=10**9,
                min_gain=1e-12):
    """Louvain-style optimisation of the Constant Potts Model (Traag, Van Dooren & Nesterov 2011):
    H = sum_c [ e_c - resolution * N_c (N_c - 1) / 2 ], node sizes N = number of files. Deterministic:
    ascending node order, candidate communities ascending, ties keep the current community."""
    def build(nn, ed):
        adj = [dict() for _ in range(nn)]
        for (a, b), wt in ed.items():
            if a == b:
                adj[a][a] = adj[a].get(a, 0.0) + wt
            else:
                adj[a][b] = adj[a].get(b, 0.0) + wt
                adj[b][a] = adj[b].get(a, 0.0) + wt
        return adj
    adj0 = build(n, edges)
    adj, sizes = adj0, [1] * n
    membership = list(range(n))
    nn = n
    levels = 0
    while levels < max_levels:
        comm = list(range(nn))
        csize = list(sizes)
        for _ in range(1000):
            moved = False
            for i in range(nn):
                cur = comm[i]
                link = {}
                for j, wt in sorted(adj[i].items()):
                    if j == i:
                        continue
                    link[comm[j]] = link.get(comm[j], 0.0) + wt
                csize[cur] -= sizes[i]
                stay = link.get(cur, 0.0) - resolution * sizes[i] * csize[cur]
                best, best_gain = cur, stay
                for c in sorted(link):
                    if c == cur:
                        continue
                    g = link[c] - resolution * sizes[i] * csize[c]
                    if g > best_gain + min_gain:
                        best, best_gain = c, g
                csize[best] += sizes[i]
                if best != cur:
                    comm[i] = best
                    moved = True
            if not moved:
                break
        levels += 1
        comm = relabel(comm)
        count = max(comm) + 1 if comm else 0
        membership = [comm[membership[v]] for v in range(n)]
        if count == nn:
            break
        agg = {}
        for i in range(nn):
            for j, wt in adj[i].items():
                if j < i:
                    continue
                a, b = comm[i], comm[j]
                key = (min(a, b), max(a, b))
                agg[key] = agg.get(key, 0.0) + wt
        new_sizes = [0] * count
        for i in range(nn):
            new_sizes[comm[i]] += sizes[i]
        adj, sizes, nn = build(count, agg), new_sizes, count
    return connected_refinement(n, adj0, membership)
