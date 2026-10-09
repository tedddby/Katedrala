# Writes a layout config (JSON: order, nudge, bend) into site/lib/demo/plan.ts's authored constants.
import json, re, sys
cfg = json.loads(open(sys.argv[1]).read() if not sys.argv[1].startswith('{') else sys.argv[1])
p = '/home/user/Katedrala/site/lib/demo/plan.ts'
s = open(p).read()
def replace_literal(name, text):
    global s
    m = re.search(r'const ' + name + r'(:[^=]+)= \{', s)
    start = m.end() - 1
    depth = 0
    for j in range(start, len(s)):
        if s[j] == '{': depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    s = s[:start] + text + s[end:]
ids = ["ApiGateway","CheckoutController","CheckoutService","OrderController","OrderService","OrderRepository","AuthService","SessionStore","InvoiceService","PaymentService","PaymentRepository","StripeClient","UserService","UserRepository","Database","EventBus"]
bays = ["gateway","checkout","orders","auth","billing","payments","users","platform"]
order = cfg.get('order', {})
s_order = '{\n' + ''.join(f'  {b}: [{", ".join(json.dumps(x) for x in order[b])}],\n' for b in bays if b in order) + '}'
replace_literal('BAY_ORDER', s_order)
nudge = cfg.get('nudge', {})
s_nudge = '{\n' + ''.join(f'  {i}: {nudge[i]},\n' for i in ids if nudge.get(i)) + '}'
replace_literal('MEMBER_NUDGE', s_nudge)
bend = cfg.get('bend', {})
s_bend = '{\n' + ''.join(f'  "{k}": {bend[k]},\n' for k in sorted(bend)) + '}'
replace_literal('BEND', s_bend)
open(p, 'w').write(s)
print('applied')
