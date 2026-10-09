// Safe arithmetic expression evaluator for formulas stored in data/*.json.
// No eval(): a small recursive-descent parser. Supported:
//   numbers, variables, + - * / ^, unary -, parentheses,
//   comparisons < <= > >= == != (yield 1 or 0), && || !,
//   functions: sqrt abs min max round pow if(cond, a, b), constant pi.

const FUNCS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
};

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/^(),<>!]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new SyntaxError(`Unexpected character at ${pos} in "${src}"`);
    if (m[1] !== undefined) tokens.push({ type: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'id', value: m[2] });
    else tokens.push({ type: 'op', value: m[3] });
    pos = re.lastIndex;
  }
  return tokens;
}

// Grammar (lowest to highest precedence):
// or: and ('||' and)* ; and: cmp ('&&' cmp)* ; cmp: add (op add)? ;
// add: mul (('+'|'-') mul)* ; mul: unary (('*'|'/') unary)* ;
// unary: ('-'|'!') unary | pow ; pow: atom ('^' unary)?
export function parse(src) {
  const tokens = tokenize(String(src));
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v) => peek() && peek().type === 'op' && peek().value === v;
  const expect = (v) => {
    if (!isOp(v)) throw new SyntaxError(`Expected "${v}" in "${src}"`);
    i++;
  };

  function atom() {
    const t = tokens[i++];
    if (!t) throw new SyntaxError(`Unexpected end of "${src}"`);
    if (t.type === 'num') return { k: 'num', v: t.value };
    if (t.type === 'op' && t.value === '(') {
      const e = or();
      expect(')');
      return e;
    }
    if (t.type === 'id') {
      if (isOp('(')) {
        i++;
        const args = [];
        if (!isOp(')')) {
          args.push(or());
          while (isOp(',')) { i++; args.push(or()); }
        }
        expect(')');
        if (t.value !== 'if' && !FUNCS[t.value]) throw new SyntaxError(`Unknown function ${t.value}`);
        if (t.value === 'if' && args.length !== 3) throw new SyntaxError('if() needs 3 arguments');
        return { k: 'call', f: t.value, args };
      }
      if (t.value === 'pi') return { k: 'num', v: Math.PI };
      return { k: 'var', name: t.value };
    }
    throw new SyntaxError(`Unexpected "${t.value}" in "${src}"`);
  }
  function pow() {
    const base = atom();
    if (isOp('^')) { i++; return { k: 'bin', op: '^', a: base, b: unary() }; }
    return base;
  }
  function unary() {
    if (isOp('-')) { i++; return { k: 'neg', a: unary() }; }
    if (isOp('!')) { i++; return { k: 'not', a: unary() }; }
    return pow();
  }
  function binLoop(next, ops) {
    let left = next();
    while (peek() && peek().type === 'op' && ops.includes(peek().value)) {
      const op = tokens[i++].value;
      left = { k: 'bin', op, a: left, b: next() };
    }
    return left;
  }
  const mul = () => binLoop(unary, ['*', '/']);
  const add = () => binLoop(mul, ['+', '-']);
  function cmp() {
    const left = add();
    if (peek() && peek().type === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(peek().value)) {
      const op = tokens[i++].value;
      return { k: 'bin', op, a: left, b: add() };
    }
    return left;
  }
  const and = () => binLoop(cmp, ['&&']);
  const or = () => binLoop(and, ['||']);

  const ast = or();
  if (i !== tokens.length) throw new SyntaxError(`Unexpected "${tokens[i].value}" in "${src}"`);
  return ast;
}

export function variables(ast, out = new Set()) {
  if (ast.k === 'var') out.add(ast.name);
  for (const child of [ast.a, ast.b, ...(ast.args || [])]) if (child) variables(child, out);
  return out;
}

export function evaluate(ast, scope) {
  switch (ast.k) {
    case 'num': return ast.v;
    case 'var': {
      if (!Object.prototype.hasOwnProperty.call(scope, ast.name)) throw new ReferenceError(`Unknown variable ${ast.name}`);
      return scope[ast.name];
    }
    case 'neg': return -evaluate(ast.a, scope);
    case 'not': return evaluate(ast.a, scope) ? 0 : 1;
    case 'call': {
      if (ast.f === 'if') return evaluate(ast.args[0], scope) ? evaluate(ast.args[1], scope) : evaluate(ast.args[2], scope);
      return FUNCS[ast.f](...ast.args.map((a) => evaluate(a, scope)));
    }
    case 'bin': {
      if (ast.op === '&&') return evaluate(ast.a, scope) && evaluate(ast.b, scope) ? 1 : 0;
      if (ast.op === '||') return evaluate(ast.a, scope) || evaluate(ast.b, scope) ? 1 : 0;
      const a = evaluate(ast.a, scope);
      const b = evaluate(ast.b, scope);
      switch (ast.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return a ** b;
        case '<': return a < b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
      }
    }
  }
  throw new Error(`Bad node ${ast.k}`);
}

const cache = new Map();
export function compute(src, scope) {
  if (!cache.has(src)) cache.set(src, parse(src));
  return evaluate(cache.get(src), scope);
}
