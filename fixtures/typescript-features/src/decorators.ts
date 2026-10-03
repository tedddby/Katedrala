type AnyConstructor = abstract new (...args: never[]) => unknown;

const services = new Map<string, AnyConstructor>();
const injectionTokens = new WeakMap<object, Map<number, string>>();
const requiredProperties = new WeakMap<object, Set<string | symbol>>();

/** Labels of the methods called through @Log, in call order. */
export const auditTrail: string[] = [];

export function Injectable(name?: string): ClassDecorator {
  return (target) => {
    services.set(name ?? target.name, target as unknown as AnyConstructor);
  };
}

export function Inject(token: string): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const tokens = injectionTokens.get(target) ?? new Map<number, string>();
    tokens.set(parameterIndex, token);
    injectionTokens.set(target, tokens);
  };
}

export function Required(): PropertyDecorator {
  return (target, propertyKey) => {
    const required = requiredProperties.get(target) ?? new Set<string | symbol>();
    required.add(propertyKey);
    requiredProperties.set(target, required);
  };
}

export function Log(label?: string): MethodDecorator {
  return (_target, propertyKey, descriptor) => {
    const original = descriptor.value;
    if (typeof original !== "function") return;
    const name = label ?? String(propertyKey);
    descriptor.value = function (this: unknown, ...args: unknown[]) {
      auditTrail.push(name);
      return original.apply(this, args);
    } as typeof original;
  };
}

export function registeredServices(): string[] {
  return [...services.keys()].sort();
}

export function injectionTokensOf(target: object): ReadonlyMap<number, string> {
  return injectionTokens.get(target) ?? new Map<number, string>();
}
