# Builds plan-build.ts: the site's plan.ts as a function of the authored order, nudges and bends, so a search can
# rebuild the plan many times in one process. Declarations lose their `export`; helpers report what is left.
import re
src = open('/home/user/Katedrala/site/lib/demo/plan.ts').read()
src = re.sub(r'from "\./([a-z]+)"', r'from "./\1.ts"', src)
lines = src.split('\n')
# Split imports (top) from the body.
i = 0
header = []
body_start = 0
in_doc = False
for idx, line in enumerate(lines):
    if line.startswith('import '):
        header.append(line)
        body_start = idx + 1
body = '\n'.join(lines[body_start:])
def param(name, key):
    global body
    m = re.search(r'const ' + name + r'(:[^=]+)= \{', body)
    assert m, name
    start = m.end() - 1
    depth = 0
    for j in range(start, len(body)):
        if body[j] == '{': depth += 1
        elif body[j] == '}':
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    body = body[:start] + '(__cfg.' + key + ' ?? ' + body[start:end] + ')' + body[end:]
param('BAY_ORDER', 'order')
param('MEMBER_NUDGE', 'nudge')
param('BEND', 'bend')
body = re.sub(r'^export (const|function|interface|type) ', r'\1 ', body, flags=re.M)
helpers = open('param-helpers.ts').read()
helpers = re.sub(r'^export function ', 'function ', helpers, flags=re.M)
out = '\n'.join(header) + '\n// eslint-disable\nexport function build(__cfg: any) {\n' + body + '\n' + helpers + '\nreturn { BAYS, PLAN_EDGES, PLAN_MEMBERS, planLabels, __issues, __valid, __edgeStats };\n}\n'
open('plan-build.ts', 'w').write(out)
