# Builds plan-param.ts from the site's plan.ts: the authored order, nudges and bends come from globalThis.__PLAN_CFG
# when it is set, and helpers report what the shipped placement leaves.
import re
src = open('/home/user/Katedrala/site/lib/demo/plan.ts').read()
src = re.sub(r'from "\./([a-z]+)"', r'from "./\1.ts"', src)
def param(name, key):
    global src
    m = re.search(r'const ' + name + r'(:[^=]+)= \{', src)
    assert m, name
    start = m.end() - 1
    depth = 0
    for i in range(start, len(src)):
        if src[i] == '{': depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    literal = src[start:end]
    src = src[:start] + '((globalThis as any).__PLAN_CFG?.' + key + ' ?? ' + literal + ')' + src[end:]
param('BAY_ORDER', 'order')
param('MEMBER_NUDGE', 'nudge')
param('BEND', 'bend')
src += open('param-helpers.ts').read()
open('plan-param.ts', 'w').write(src)
