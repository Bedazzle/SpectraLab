// @ts-check
"use strict";

/**
 * SpectraLab Scripting Engine — Tokenizer + Parser + Interpreter
 * AREXX/BASIC-style language for automating drawing and generative art.
 */

// ============================================================================
// Token types
// ============================================================================

const TOKEN = Object.freeze({
  NUMBER:     'NUMBER',
  STRING:     'STRING',
  IDENT:      'IDENT',
  KEYWORD:    'KEYWORD',
  COMMAND:    'COMMAND',
  QUERY:      'QUERY',
  MATHFUNC:   'MATHFUNC',
  SCREENOP:   'SCREENOP',
  OPERATOR:   'OPERATOR',
  COMMA:      'COMMA',
  LPAREN:     'LPAREN',
  RPAREN:     'RPAREN',
  NEWLINE:    'NEWLINE',
  EOF:        'EOF'
});

const KEYWORDS = new Set([
  'LET', 'FOR', 'TO', 'STEP', 'NEXT',
  'IF', 'THEN', 'ELSE', 'ENDIF',
  'REPEAT', 'ENDREPEAT',
  'WHILE', 'ENDWHILE',
  'FUNC', 'ENDFUNC',
  'CALL', 'RETURN',
  'PRINT', 'REM'
]);

const COMMANDS = new Set([
  'PIXEL', 'PIXELPAPER', 'LINE', 'RECT', 'FILLRECT',
  'CIRCLE', 'FILL', 'CLEAR',
  'SETINK', 'SETPAPER', 'SETBRIGHT', 'SETFLASH', 'SETATTR',
  'PLOT', 'RENDER', 'UNDO', 'REDO'
]);

const QUERY_FUNCTIONS = new Set([
  'GETPIXEL', 'GETINK', 'GETPAPER', 'GETBRIGHT'
]);

const MATH_FUNCTIONS = new Set([
  'SIN', 'COS', 'TAN', 'SQRT', 'ABS',
  'FLOOR', 'CEIL', 'ROUND', 'MIN', 'MAX', 'RANDOM', 'PI'
]);

const SCREEN_OPS = new Set([
  'WIDTH', 'HEIGHT'
]);

// ============================================================================
// Tokenizer
// ============================================================================

function tokenize(source) {
  const tokens = [];
  const lines = source.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let col = 0;
    const lineNum = lineIdx + 1;

    while (col < line.length) {
      const ch = line[col];

      // Skip whitespace (not newline)
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        col++;
        continue;
      }

      // Comment: # to end of line
      if (ch === '#') break;

      // Two-character operators
      if (col + 1 < line.length) {
        const two = line[col] + line[col + 1];
        if (two === '<=' || two === '>=' || two === '<>' || two === '!=') {
          tokens.push({ type: TOKEN.OPERATOR, value: two, line: lineNum, col: col + 1 });
          col += 2;
          continue;
        }
      }

      // Single-character operators and punctuation
      if ('+-*/%=<>'.includes(ch)) {
        tokens.push({ type: TOKEN.OPERATOR, value: ch, line: lineNum, col: col + 1 });
        col++;
        continue;
      }
      if (ch === '(') {
        tokens.push({ type: TOKEN.LPAREN, value: '(', line: lineNum, col: col + 1 });
        col++;
        continue;
      }
      if (ch === ')') {
        tokens.push({ type: TOKEN.RPAREN, value: ')', line: lineNum, col: col + 1 });
        col++;
        continue;
      }
      if (ch === ',') {
        tokens.push({ type: TOKEN.COMMA, value: ',', line: lineNum, col: col + 1 });
        col++;
        continue;
      }

      // Number literal
      if (ch >= '0' && ch <= '9') {
        let num = '';
        let hasDot = false;
        while (col < line.length && ((line[col] >= '0' && line[col] <= '9') || (line[col] === '.' && !hasDot))) {
          if (line[col] === '.') hasDot = true;
          num += line[col];
          col++;
        }
        tokens.push({ type: TOKEN.NUMBER, value: parseFloat(num), line: lineNum, col: col + 1 });
        continue;
      }

      // String literal
      if (ch === '"' || ch === "'") {
        const quote = ch;
        col++;
        let str = '';
        while (col < line.length && line[col] !== quote) {
          if (line[col] === '\\' && col + 1 < line.length) {
            col++;
            const esc = line[col];
            if (esc === 'n') str += '\n';
            else if (esc === 't') str += '\t';
            else if (esc === '\\') str += '\\';
            else if (esc === quote) str += quote;
            else str += '\\' + esc;
          } else {
            str += line[col];
          }
          col++;
        }
        if (col < line.length) col++; // skip closing quote
        tokens.push({ type: TOKEN.STRING, value: str, line: lineNum, col: col + 1 });
        continue;
      }

      // Identifier / keyword / command
      if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
        let ident = '';
        while (col < line.length && ((line[col] >= 'A' && line[col] <= 'Z') ||
               (line[col] >= 'a' && line[col] <= 'z') ||
               (line[col] >= '0' && line[col] <= '9') || line[col] === '_')) {
          ident += line[col];
          col++;
        }

        const upper = ident.toUpperCase();

        // REM — rest of line is comment
        if (upper === 'REM') break;

        if (upper === 'AND' || upper === 'OR' || upper === 'NOT') {
          tokens.push({ type: TOKEN.OPERATOR, value: upper, line: lineNum, col: col + 1 });
        } else if (KEYWORDS.has(upper)) {
          tokens.push({ type: TOKEN.KEYWORD, value: upper, line: lineNum, col: col + 1 });
        } else if (COMMANDS.has(upper)) {
          tokens.push({ type: TOKEN.COMMAND, value: upper, line: lineNum, col: col + 1 });
        } else if (QUERY_FUNCTIONS.has(upper)) {
          tokens.push({ type: TOKEN.QUERY, value: upper, line: lineNum, col: col + 1 });
        } else if (MATH_FUNCTIONS.has(upper)) {
          tokens.push({ type: TOKEN.MATHFUNC, value: upper, line: lineNum, col: col + 1 });
        } else if (SCREEN_OPS.has(upper)) {
          tokens.push({ type: TOKEN.SCREENOP, value: upper, line: lineNum, col: col + 1 });
        } else {
          tokens.push({ type: TOKEN.IDENT, value: ident, line: lineNum, col: col + 1 });
        }
        continue;
      }

      // Unknown character — skip
      col++;
    }

    // Add newline token at end of each line (helps parser with statement boundaries)
    tokens.push({ type: TOKEN.NEWLINE, value: '\n', line: lineNum, col: line.length + 1 });
  }

  tokens.push({ type: TOKEN.EOF, value: null, line: lines.length, col: 0 });
  return tokens;
}

// ============================================================================
// Parser
// ============================================================================

function parse(tokens) {
  let pos = 0;

  function peek() {
    return tokens[pos] || { type: TOKEN.EOF, value: null, line: 0, col: 0 };
  }

  function advance() {
    const t = tokens[pos];
    pos++;
    return t;
  }

  function expect(type, value) {
    const t = peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new SyntaxError(`Line ${t.line}: Expected ${value || type}, got "${t.value}"`);
    }
    return advance();
  }

  function skipNewlines() {
    while (peek().type === TOKEN.NEWLINE) advance();
  }

  function atBlockEnd(terminators) {
    const t = peek();
    if (t.type === TOKEN.EOF) return true;
    if (t.type === TOKEN.KEYWORD && terminators.includes(t.value)) return true;
    return false;
  }

  // ---- Expression parsing (precedence climbing) ----

  function parseExpr() {
    return parseOr();
  }

  function parseOr() {
    let left = parseAnd();
    while (peek().type === TOKEN.OPERATOR && peek().value === 'OR') {
      const op = advance();
      const right = parseAnd();
      left = { type: 'binary', op: 'OR', left, right, line: op.line };
    }
    return left;
  }

  function parseAnd() {
    let left = parseComparison();
    while (peek().type === TOKEN.OPERATOR && peek().value === 'AND') {
      const op = advance();
      const right = parseComparison();
      left = { type: 'binary', op: 'AND', left, right, line: op.line };
    }
    return left;
  }

  function parseComparison() {
    let left = parseAddition();
    const compOps = ['<', '>', '<=', '>=', '=', '<>', '!='];
    while (peek().type === TOKEN.OPERATOR && compOps.includes(peek().value)) {
      const op = advance();
      const right = parseAddition();
      left = { type: 'binary', op: op.value, left, right, line: op.line };
    }
    return left;
  }

  function parseAddition() {
    let left = parseMultiply();
    while (peek().type === TOKEN.OPERATOR && (peek().value === '+' || peek().value === '-')) {
      const op = advance();
      const right = parseMultiply();
      left = { type: 'binary', op: op.value, left, right, line: op.line };
    }
    return left;
  }

  function parseMultiply() {
    let left = parseUnary();
    while (peek().type === TOKEN.OPERATOR && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = advance();
      const right = parseUnary();
      left = { type: 'binary', op: op.value, left, right, line: op.line };
    }
    return left;
  }

  function parseUnary() {
    if (peek().type === TOKEN.OPERATOR && peek().value === '-') {
      const op = advance();
      const expr = parseUnary();
      return { type: 'unary', op: '-', expr, line: op.line };
    }
    if (peek().type === TOKEN.OPERATOR && peek().value === 'NOT') {
      const op = advance();
      const expr = parseUnary();
      return { type: 'unary', op: 'NOT', expr, line: op.line };
    }
    return parsePrimary();
  }

  function parseArgs() {
    const args = [];
    if (peek().type !== TOKEN.RPAREN) {
      args.push(parseExpr());
      while (peek().type === TOKEN.COMMA) {
        advance();
        args.push(parseExpr());
      }
    }
    return args;
  }

  function parsePrimary() {
    const t = peek();

    // Number
    if (t.type === TOKEN.NUMBER) {
      advance();
      return { type: 'number', value: t.value, line: t.line };
    }

    // String
    if (t.type === TOKEN.STRING) {
      advance();
      return { type: 'string', value: t.value, line: t.line };
    }

    // PI constant
    if (t.type === TOKEN.MATHFUNC && t.value === 'PI') {
      advance();
      // PI can be used without parens
      if (peek().type === TOKEN.LPAREN) {
        advance();
        expect(TOKEN.RPAREN);
      }
      return { type: 'number', value: Math.PI, line: t.line };
    }

    // Math functions
    if (t.type === TOKEN.MATHFUNC) {
      advance();
      expect(TOKEN.LPAREN);
      const args = parseArgs();
      expect(TOKEN.RPAREN);
      return { type: 'funcCall', name: t.value, args, line: t.line };
    }

    // Query functions (GETPIXEL, GETINK, etc.)
    if (t.type === TOKEN.QUERY) {
      advance();
      expect(TOKEN.LPAREN);
      const args = parseArgs();
      expect(TOKEN.RPAREN);
      return { type: 'funcCall', name: t.value, args, line: t.line };
    }

    // Screen ops (WIDTH, HEIGHT)
    if (t.type === TOKEN.SCREENOP) {
      advance();
      if (peek().type === TOKEN.LPAREN) {
        advance();
        expect(TOKEN.RPAREN);
      }
      return { type: 'funcCall', name: t.value, args: [], line: t.line };
    }

    // RANDOM(n) — also a math func but handled via MATHFUNC token
    // (already covered above)

    // Parenthesized expression
    if (t.type === TOKEN.LPAREN) {
      advance();
      const expr = parseExpr();
      expect(TOKEN.RPAREN);
      return expr;
    }

    // Identifier — variable or user function call
    if (t.type === TOKEN.IDENT) {
      advance();
      if (peek().type === TOKEN.LPAREN) {
        advance();
        const args = parseArgs();
        expect(TOKEN.RPAREN);
        return { type: 'funcCall', name: t.value, args, line: t.line };
      }
      return { type: 'variable', name: t.value, line: t.line };
    }

    throw new SyntaxError(`Line ${t.line}: Unexpected token "${t.value}" (${t.type})`);
  }

  // ---- Statement parsing ----

  function parseStatement() {
    skipNewlines();
    const t = peek();

    if (t.type === TOKEN.EOF) return null;

    // LET var = expr
    if (t.type === TOKEN.KEYWORD && t.value === 'LET') {
      return parseLetStmt();
    }

    // FOR var = expr TO expr [STEP expr]
    if (t.type === TOKEN.KEYWORD && t.value === 'FOR') {
      return parseForStmt();
    }

    // IF expr THEN ... [ELSE ...] ENDIF
    if (t.type === TOKEN.KEYWORD && t.value === 'IF') {
      return parseIfStmt();
    }

    // REPEAT expr ... ENDREPEAT
    if (t.type === TOKEN.KEYWORD && t.value === 'REPEAT') {
      return parseRepeatStmt();
    }

    // WHILE expr ... ENDWHILE
    if (t.type === TOKEN.KEYWORD && t.value === 'WHILE') {
      return parseWhileStmt();
    }

    // FUNC name(params) ... ENDFUNC
    if (t.type === TOKEN.KEYWORD && t.value === 'FUNC') {
      return parseFuncStmt();
    }

    // CALL name(args)
    if (t.type === TOKEN.KEYWORD && t.value === 'CALL') {
      return parseCallStmt();
    }

    // RETURN [expr]
    if (t.type === TOKEN.KEYWORD && t.value === 'RETURN') {
      return parseReturnStmt();
    }

    // PRINT expr, expr, ...
    if (t.type === TOKEN.KEYWORD && t.value === 'PRINT') {
      return parsePrintStmt();
    }

    // Drawing / screen commands
    if (t.type === TOKEN.COMMAND) {
      return parseCommandStmt();
    }

    // Bare assignment: var = expr (shorthand for LET)
    if (t.type === TOKEN.IDENT && pos + 1 < tokens.length && tokens[pos + 1].type === TOKEN.OPERATOR && tokens[pos + 1].value === '=') {
      return parseLetStmt();
    }

    throw new SyntaxError(`Line ${t.line}: Unexpected token "${t.value}"`);
  }

  function parseLetStmt() {
    const t = peek();
    const line = t.line;
    if (t.type === TOKEN.KEYWORD && t.value === 'LET') advance();
    const name = expect(TOKEN.IDENT).value;
    expect(TOKEN.OPERATOR, '=');
    const value = parseExpr();
    return { type: 'let', name, value, line };
  }

  function parseForStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'FOR');
    const varName = expect(TOKEN.IDENT).value;
    expect(TOKEN.OPERATOR, '=');
    const from = parseExpr();
    expect(TOKEN.KEYWORD, 'TO');
    const to = parseExpr();
    let step = null;
    if (peek().type === TOKEN.KEYWORD && peek().value === 'STEP') {
      advance();
      step = parseExpr();
    }
    const body = parseBlock(['NEXT']);
    expect(TOKEN.KEYWORD, 'NEXT');
    return { type: 'for', varName, from, to, step, body, line };
  }

  function parseIfStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'IF');
    const condition = parseExpr();
    expect(TOKEN.KEYWORD, 'THEN');
    const thenBody = parseBlock(['ELSE', 'ENDIF']);
    let elseBody = [];
    if (peek().type === TOKEN.KEYWORD && peek().value === 'ELSE') {
      advance();
      elseBody = parseBlock(['ENDIF']);
    }
    expect(TOKEN.KEYWORD, 'ENDIF');
    return { type: 'if', condition, thenBody, elseBody, line };
  }

  function parseRepeatStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'REPEAT');
    const count = parseExpr();
    const body = parseBlock(['ENDREPEAT']);
    expect(TOKEN.KEYWORD, 'ENDREPEAT');
    return { type: 'repeat', count, body, line };
  }

  function parseWhileStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'WHILE');
    const condition = parseExpr();
    const body = parseBlock(['ENDWHILE']);
    expect(TOKEN.KEYWORD, 'ENDWHILE');
    return { type: 'while', condition, body, line };
  }

  function parseFuncStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'FUNC');
    const name = expect(TOKEN.IDENT).value;
    expect(TOKEN.LPAREN);
    const params = [];
    if (peek().type !== TOKEN.RPAREN) {
      params.push(expect(TOKEN.IDENT).value);
      while (peek().type === TOKEN.COMMA) {
        advance();
        params.push(expect(TOKEN.IDENT).value);
      }
    }
    expect(TOKEN.RPAREN);
    const body = parseBlock(['ENDFUNC']);
    expect(TOKEN.KEYWORD, 'ENDFUNC');
    return { type: 'func', name, params, body, line };
  }

  function parseCallStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'CALL');
    const name = expect(TOKEN.IDENT).value;
    expect(TOKEN.LPAREN);
    const args = parseArgs();
    expect(TOKEN.RPAREN);
    return { type: 'call', name, args, line };
  }

  function parseReturnStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'RETURN');
    let value = null;
    // Check if there's an expression on the same line
    if (peek().type !== TOKEN.NEWLINE && peek().type !== TOKEN.EOF) {
      value = parseExpr();
    }
    return { type: 'return', value, line };
  }

  function parsePrintStmt() {
    const line = peek().line;
    expect(TOKEN.KEYWORD, 'PRINT');
    const args = [];
    if (peek().type !== TOKEN.NEWLINE && peek().type !== TOKEN.EOF) {
      args.push(parseExpr());
      while (peek().type === TOKEN.COMMA) {
        advance();
        args.push(parseExpr());
      }
    }
    return { type: 'print', args, line };
  }

  function parseCommandStmt() {
    const t = advance();
    const name = t.value;
    const args = [];
    // Parse arguments until newline or EOF
    while (peek().type !== TOKEN.NEWLINE && peek().type !== TOKEN.EOF &&
           peek().type !== TOKEN.KEYWORD && peek().type !== TOKEN.COMMAND) {
      // Allow comma-separated or space-separated args
      if (peek().type === TOKEN.COMMA) {
        advance();
        continue;
      }
      args.push(parseExpr());
    }
    return { type: 'command', name, args, line: t.line };
  }

  function parseBlock(terminators) {
    const stmts = [];
    skipNewlines();
    while (!atBlockEnd(terminators)) {
      const stmt = parseStatement();
      if (stmt) stmts.push(stmt);
      skipNewlines();
    }
    return stmts;
  }

  // ---- Parse program ----
  const program = parseBlock([]);
  return program;
}

// ============================================================================
// Interpreter
// ============================================================================

const RETURN_SIGNAL = Symbol('RETURN');
const YIELD_INTERVAL = 1000;

function createInterpreter(callbacks) {
  let stopped = false;
  let stmtCount = 0;

  const builtinFuncs = {};
  const commands = {};

  function registerCommand(name, fn) {
    commands[name.toUpperCase()] = fn;
  }

  function registerFunction(name, fn) {
    builtinFuncs[name.toUpperCase()] = fn;
  }

  // Default built-in math functions
  registerFunction('SIN',    (args) => Math.sin(args[0]));
  registerFunction('COS',    (args) => Math.cos(args[0]));
  registerFunction('TAN',    (args) => Math.tan(args[0]));
  registerFunction('SQRT',   (args) => Math.sqrt(args[0]));
  registerFunction('ABS',    (args) => Math.abs(args[0]));
  registerFunction('FLOOR',  (args) => Math.floor(args[0]));
  registerFunction('CEIL',   (args) => Math.ceil(args[0]));
  registerFunction('ROUND',  (args) => Math.round(args[0]));
  registerFunction('MIN',    (args) => Math.min(args[0], args[1]));
  registerFunction('MAX',    (args) => Math.max(args[0], args[1]));
  registerFunction('RANDOM', (args) => Math.floor(Math.random() * (args[0] || 1)));

  async function maybeYield() {
    stmtCount++;
    if (stmtCount >= YIELD_INTERVAL) {
      stmtCount = 0;
      await new Promise(resolve => setTimeout(resolve, 0));
      if (stopped) throw new Error('Script stopped by user');
    }
  }

  function makeEnv(parent) {
    return { vars: {}, funcs: {}, parent };
  }

  function getVar(env, name) {
    let e = env;
    while (e) {
      if (name in e.vars) return e.vars[name];
      e = e.parent;
    }
    return 0; // undefined variables default to 0
  }

  function setVar(env, name, value) {
    // Search up scope chain for existing variable
    let e = env;
    while (e) {
      if (name in e.vars) {
        e.vars[name] = value;
        return;
      }
      e = e.parent;
    }
    // Not found — create in current scope
    env.vars[name] = value;
  }

  function getFunc(env, name) {
    let e = env;
    while (e) {
      if (name in e.funcs) return e.funcs[name];
      e = e.parent;
    }
    return null;
  }

  async function evalExpr(node, env) {
    if (stopped) throw new Error('Script stopped by user');

    switch (node.type) {
      case 'number':
        return node.value;

      case 'string':
        return node.value;

      case 'variable':
        return getVar(env, node.name);

      case 'binary': {
        const left = await evalExpr(node.left, env);
        const right = await evalExpr(node.right, env);
        switch (node.op) {
          case '+':  return (typeof left === 'string' || typeof right === 'string') ? String(left) + String(right) : left + right;
          case '-':  return left - right;
          case '*':  return left * right;
          case '/':  if (right === 0) throw new Error(`Line ${node.line}: Division by zero`); return left / right;
          case '%':  if (right === 0) throw new Error(`Line ${node.line}: Modulo by zero`); return left % right;
          case '<':  return left < right ? 1 : 0;
          case '>':  return left > right ? 1 : 0;
          case '<=': return left <= right ? 1 : 0;
          case '>=': return left >= right ? 1 : 0;
          case '=':  return left === right ? 1 : 0;
          case '<>': return left !== right ? 1 : 0;
          case '!=': return left !== right ? 1 : 0;
          case 'AND': return (left && right) ? 1 : 0;
          case 'OR':  return (left || right) ? 1 : 0;
          default: throw new Error(`Line ${node.line}: Unknown operator "${node.op}"`);
        }
      }

      case 'unary': {
        const val = await evalExpr(node.expr, env);
        if (node.op === '-') return -val;
        if (node.op === 'NOT') return val ? 0 : 1;
        throw new Error(`Line ${node.line}: Unknown unary operator "${node.op}"`);
      }

      case 'funcCall': {
        const args = [];
        for (const arg of node.args) {
          args.push(await evalExpr(arg, env));
        }
        const upperName = node.name.toUpperCase();

        // Check built-in functions first
        if (builtinFuncs[upperName]) {
          return builtinFuncs[upperName](args);
        }

        // Check registered commands used as functions (query functions)
        if (commands[upperName]) {
          return commands[upperName](args);
        }

        // User-defined function
        const func = getFunc(env, node.name);
        if (func) {
          const funcEnv = makeEnv(func.closureEnv);
          for (let i = 0; i < func.params.length; i++) {
            funcEnv.vars[func.params[i]] = args[i] !== undefined ? args[i] : 0;
          }
          const result = await execBlock(func.body, funcEnv);
          if (result && result[RETURN_SIGNAL] !== undefined) {
            return result[RETURN_SIGNAL];
          }
          return 0;
        }

        throw new Error(`Line ${node.line}: Unknown function "${node.name}"`);
      }

      default:
        throw new Error(`Line ${node.line}: Unknown expression type "${node.type}"`);
    }
  }

  async function execStmt(node, env) {
    if (stopped) throw new Error('Script stopped by user');
    await maybeYield();

    switch (node.type) {
      case 'let': {
        const value = await evalExpr(node.value, env);
        setVar(env, node.name, value);
        return;
      }

      case 'for': {
        const from = await evalExpr(node.from, env);
        const to = await evalExpr(node.to, env);
        const step = node.step ? await evalExpr(node.step, env) : (from <= to ? 1 : -1);
        if (step === 0) throw new Error(`Line ${node.line}: FOR loop STEP cannot be 0`);

        setVar(env, node.varName, from);

        if (step > 0) {
          for (let i = from; i <= to; i += step) {
            if (stopped) throw new Error('Script stopped by user');
            setVar(env, node.varName, i);
            const result = await execBlock(node.body, env);
            if (result && result[RETURN_SIGNAL] !== undefined) return result;
          }
        } else {
          for (let i = from; i >= to; i += step) {
            if (stopped) throw new Error('Script stopped by user');
            setVar(env, node.varName, i);
            const result = await execBlock(node.body, env);
            if (result && result[RETURN_SIGNAL] !== undefined) return result;
          }
        }
        return;
      }

      case 'if': {
        const cond = await evalExpr(node.condition, env);
        if (cond) {
          return await execBlock(node.thenBody, env);
        } else if (node.elseBody.length > 0) {
          return await execBlock(node.elseBody, env);
        }
        return;
      }

      case 'repeat': {
        const count = Math.floor(await evalExpr(node.count, env));
        for (let i = 0; i < count; i++) {
          if (stopped) throw new Error('Script stopped by user');
          const result = await execBlock(node.body, env);
          if (result && result[RETURN_SIGNAL] !== undefined) return result;
        }
        return;
      }

      case 'while': {
        while (true) {
          if (stopped) throw new Error('Script stopped by user');
          const cond = await evalExpr(node.condition, env);
          if (!cond) break;
          const result = await execBlock(node.body, env);
          if (result && result[RETURN_SIGNAL] !== undefined) return result;
          await maybeYield();
        }
        return;
      }

      case 'func': {
        env.funcs[node.name] = {
          params: node.params,
          body: node.body,
          closureEnv: env
        };
        return;
      }

      case 'call': {
        const args = [];
        for (const arg of node.args) {
          args.push(await evalExpr(arg, env));
        }
        const func = getFunc(env, node.name);
        if (!func) throw new Error(`Line ${node.line}: Unknown function "${node.name}"`);
        const funcEnv = makeEnv(func.closureEnv);
        for (let i = 0; i < func.params.length; i++) {
          funcEnv.vars[func.params[i]] = args[i] !== undefined ? args[i] : 0;
        }
        await execBlock(func.body, funcEnv);
        return;
      }

      case 'return': {
        const value = node.value ? await evalExpr(node.value, env) : 0;
        return { [RETURN_SIGNAL]: value };
      }

      case 'print': {
        const values = [];
        for (const arg of node.args) {
          values.push(await evalExpr(arg, env));
        }
        if (callbacks && callbacks.onPrint) {
          callbacks.onPrint(values.join(' '));
        }
        return;
      }

      case 'command': {
        const upperName = node.name.toUpperCase();
        const cmd = commands[upperName];
        if (!cmd) throw new Error(`Line ${node.line}: Unknown command "${node.name}"`);
        const args = [];
        for (const arg of node.args) {
          args.push(await evalExpr(arg, env));
        }
        cmd(args);
        return;
      }

      default:
        throw new Error(`Line ${node.line}: Unknown statement type "${node.type}"`);
    }
  }

  async function execBlock(stmts, env) {
    for (const stmt of stmts) {
      const result = await execStmt(stmt, env);
      if (result && result[RETURN_SIGNAL] !== undefined) return result;
    }
    return undefined;
  }

  async function run(source, preParsedAst) {
    stopped = false;
    stmtCount = 0;

    const ast = preParsedAst || parse(tokenize(source));
    const env = makeEnv(null);

    try {
      await execBlock(ast, env);
    } catch (e) {
      if (e.message === 'Script stopped by user') {
        if (callbacks && callbacks.onStop) callbacks.onStop();
        return;
      }
      throw e;
    }
  }

  function stop() {
    stopped = true;
  }

  return {
    run,
    stop,
    registerCommand,
    registerFunction,
    get isRunning() { return !stopped && stmtCount >= 0; }
  };
}

// ============================================================================
// Public API
// ============================================================================

const ScriptEngine = (() => {
  let interpreter = null;
  let running = false;

  return {
    /**
     * Run a script source string.
     * @param {string} source
     * @param {object} callbacks - { onPrint, onError, onDone, onStop }
     * @returns {Promise<void>}
     */
    async run(source, callbacks = {}) {
      if (running) {
        if (callbacks.onError) callbacks.onError('A script is already running');
        return;
      }

      // Parse first to catch syntax errors before execution
      let ast;
      try {
        const tokens = tokenize(source);
        ast = parse(tokens);
      } catch (e) {
        if (callbacks.onError) callbacks.onError(e.message);
        return;
      }

      running = true;
      interpreter = createInterpreter({
        onPrint: callbacks.onPrint,
        onStop: () => {
          running = false;
          if (callbacks.onStop) callbacks.onStop();
        }
      });

      // Register external commands
      if (ScriptEngine._commands) {
        for (const [name, fn] of Object.entries(ScriptEngine._commands)) {
          interpreter.registerCommand(name, fn);
        }
      }
      if (ScriptEngine._functions) {
        for (const [name, fn] of Object.entries(ScriptEngine._functions)) {
          interpreter.registerFunction(name, fn);
        }
      }

      try {
        await interpreter.run(source, ast);
        running = false;
        if (callbacks.onDone) callbacks.onDone();
      } catch (e) {
        running = false;
        if (callbacks.onError) callbacks.onError(e.message);
      }
    },

    stop() {
      if (interpreter) interpreter.stop();
      running = false;
    },

    isRunning() {
      return running;
    },

    tokenize(source) {
      return tokenize(source);
    },

    parse(source) {
      const tokens = tokenize(source);
      return parse(tokens);
    },

    /** @type {Object<string, Function>} */
    _commands: {},

    /** @type {Object<string, Function>} */
    _functions: {},

    registerCommand(name, fn) {
      ScriptEngine._commands[name.toUpperCase()] = fn;
    },

    registerFunction(name, fn) {
      ScriptEngine._functions[name.toUpperCase()] = fn;
    }
  };
})();
