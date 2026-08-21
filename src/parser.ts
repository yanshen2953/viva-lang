import type {
  Artifact,
  BinaryOp,
  Expr,
  LayerDecl,
  SceneDecl,
  SceneItem,
  Statement,
} from "./ast.js";
import { emptyArtifact } from "./ast.js";
import type { Diagnostic, Span } from "./diagnostics.js";
import { VivaError } from "./diagnostics.js";
import type { Token, TokenType } from "./lexer.js";
import { tokenize } from "./lexer.js";

export function parse(source: string, filename = "<input>"): Artifact {
  return new Parser(tokenize(source, filename), filename).parseArtifact();
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly filename: string,
  ) {}

  parseArtifact(): Artifact {
    this.skipNewlines();
    this.expectKeyword("artifact");
    const nameTok = this.expectOneOf(["STRING", "IDENT"]);
    const artifact = emptyArtifact(nameTok.value, nameTok.span);
    this.eat("NEWLINE");
    this.skipNewlines();

    while (!this.check("EOF")) {
      this.parseDecl(artifact);
      this.skipNewlines();
    }
    return artifact;
  }

  private parseDecl(artifact: Artifact): void {
    const tok = this.peek();
    if (tok.type !== "KEYWORD") {
      throw this.error(`expected declaration, got '${tok.value || tok.type}'`, tok.span);
    }
    switch (tok.value) {
      case "state":
        artifact.states.push(this.parseNamedValue("state"));
        return;
      case "data":
        artifact.data.push(this.parseNamedValue("data"));
        return;
      case "entity":
        artifact.entities.push(this.parseEntity());
        return;
      case "scene":
        artifact.scene = this.parseScene();
        return;
      case "event":
        artifact.events.push(this.parseEvent());
        return;
      case "rule":
        artifact.rules.push(this.parseRule());
        return;
      case "bind":
        artifact.binds.push(this.parseBind());
        return;
      case "tick":
        artifact.ticks.push(this.parseTick());
        return;
      case "animate":
        artifact.animates.push(this.parseNamedBlock("animate"));
        return;
      case "widget":
      case "timeline":
        artifact.widgets.push(this.parseWidget());
        return;
      case "function":
        artifact.functions.push(this.parseFunction());
        return;
      default:
        throw this.error(`unknown declaration '${tok.value}'`, tok.span);
    }
  }

  private parseNamedValue(kind: string): { name: string; value: Expr; span: Span } {
    const start = this.expectKeyword(kind);
    const name = this.expectOneOf(["IDENT", "KEYWORD"]).value;
    this.expect("EQ");
    const value = this.parseExpr();
    this.eat("NEWLINE");
    return { name, value, span: start.span };
  }

  private parseEntity(): { name: string; props: Record<string, Expr>; span: Span } {
    const start = this.expectKeyword("entity");
    const name = this.expectOneOf(["IDENT", "KEYWORD"]).value;
    this.eat("NEWLINE");
    return { name, props: this.parsePropBlock(), span: start.span };
  }

  private parseScene(): SceneDecl {
    const start = this.expectKeyword("scene");
    this.eat("NEWLINE");
    const props: Record<string, Expr> = {};
    const layers: LayerDecl[] = [];
    if (this.eat("INDENT")) {
      while (!this.check("DEDENT") && !this.check("EOF")) {
        this.skipNewlines();
        if (this.check("DEDENT") || this.check("EOF")) break;
        if (this.isKeyword("layer")) {
          layers.push(this.parseLayer());
        } else {
          Object.assign(props, this.parsePropLine());
        }
      }
      this.expect("DEDENT");
    }
    return { props, layers, span: start.span };
  }

  private parseLayer(): LayerDecl {
    const start = this.expectKeyword("layer");
    const name = this.expectOneOf(["IDENT", "KEYWORD", "STRING"]).value;
    this.eat("NEWLINE");
    const props: Record<string, Expr> = {};
    const items: SceneItem[] = [];
    if (this.eat("INDENT")) {
      while (!this.check("DEDENT") && !this.check("EOF")) {
        this.skipNewlines();
        if (this.check("DEDENT") || this.check("EOF")) break;
        if (this.isKeyword("for") || this.isKeyword("if") || this.isKeyword("node")) {
          items.push(this.parseSceneItem());
        } else {
          Object.assign(props, this.parsePropLine());
        }
      }
      this.expect("DEDENT");
    }
    return { name, props, items, span: start.span };
  }

  private parseSceneBlock(): SceneItem[] {
    const items: SceneItem[] = [];
    if (!this.eat("INDENT")) return items;
    while (!this.check("DEDENT") && !this.check("EOF")) {
      this.skipNewlines();
      if (this.check("DEDENT") || this.check("EOF")) break;
      items.push(this.parseSceneItem());
    }
    this.expect("DEDENT");
    return items;
  }

  private parseSceneItem(): SceneItem {
    if (this.isKeyword("for")) {
      const start = this.expectKeyword("for");
      const item = this.expect("IDENT").value;
      this.expectKeyword("in");
      const source = this.parseExpr();
      this.eat("NEWLINE");
      return { kind: "for", item, source, body: this.parseSceneBlock(), span: start.span };
    }
    if (this.isKeyword("if")) {
      const start = this.expectKeyword("if");
      const cond = this.parseExpr();
      this.eat("NEWLINE");
      return { kind: "if", cond, body: this.parseSceneBlock(), span: start.span };
    }
    const start = this.expectKeyword("node");
    const name = this.expectOneOf(["IDENT", "KEYWORD", "STRING"]).value;
    let alias: string | undefined;
    if (this.isKeyword("as")) {
      this.advance();
      alias = this.expectOneOf(["IDENT", "KEYWORD", "STRING"]).value;
    }
    this.eat("NEWLINE");
    return {
      kind: "node",
      name,
      alias,
      props: this.parsePropBlock(),
      span: start.span,
    };
  }

  private parseEvent(): Artifact["events"][number] {
    const start = this.expectKeyword("event");
    const type = this.expectOneOf(["IDENT", "KEYWORD"]).value;
    this.expectKeyword("on");
    const target = this.expectOneOf(["IDENT", "KEYWORD", "STRING"]).value;
    this.eat("NEWLINE");
    return { type, target, body: this.parseStmtBlock(), span: start.span };
  }

  private parseRule(): Artifact["rules"][number] {
    const start = this.expectKeyword("rule");
    this.expectKeyword("when");
    const cond = this.parseExpr();
    this.eat("NEWLINE");
    return { cond, body: this.parseStmtBlock(), span: start.span };
  }

  private parseBind(): Artifact["binds"][number] {
    const start = this.expectKeyword("bind");
    const target = this.parsePath();
    this.expect("BIND");
    const source = this.parseExpr();
    this.eat("NEWLINE");
    return { target, source, span: start.span };
  }

  private parseTick(): Artifact["ticks"][number] {
    const start = this.expectKeyword("tick");
    const fps = this.check("NUMBER") ? Number(this.advance().value) : 60;
    this.eat("NEWLINE");
    return { fps, body: this.parseStmtBlock(), span: start.span };
  }

  private parseNamedBlock(kind: string): {
    name: string;
    props: Record<string, Expr>;
    span: Span;
  } {
    const start = this.expectKeyword(kind);
    const name = this.checkOneOf(["IDENT", "KEYWORD", "STRING"])
      ? this.advance().value
      : kind;
    this.eat("NEWLINE");
    return { name, props: this.parsePropBlock(), span: start.span };
  }

  private parseWidget(): Artifact["widgets"][number] {
    if (this.isKeyword("timeline")) {
      const start = this.expectKeyword("timeline");
      this.eat("NEWLINE");
      return { name: "timeline", props: this.parsePropBlock(), span: start.span };
    }
    return this.parseNamedBlock("widget");
  }

  private parseFunction(): Artifact["functions"][number] {
    const start = this.expectKeyword("function");
    const name = this.expect("IDENT").value;
    this.expect("LPAREN");
    const params: string[] = [];
    if (!this.check("RPAREN")) {
      params.push(this.expect("IDENT").value);
      while (this.eat("COMMA")) params.push(this.expect("IDENT").value);
    }
    this.expect("RPAREN");
    this.eat("NEWLINE");
    return { name, params, body: this.parseStmtBlock(), span: start.span };
  }

  private parseStmtBlock(): Statement[] {
    const body: Statement[] = [];
    if (!this.eat("INDENT")) return body;
    while (!this.check("DEDENT") && !this.check("EOF")) {
      this.skipNewlines();
      if (this.check("DEDENT") || this.check("EOF")) break;
      body.push(this.parseStatement());
    }
    this.expect("DEDENT");
    return body;
  }

  private parseStatement(): Statement {
    if (this.isKeyword("if")) {
      const start = this.expectKeyword("if");
      const cond = this.parseExpr();
      this.eat("NEWLINE");
      return { kind: "if", cond, body: this.parseStmtBlock(), span: start.span };
    }
    if (this.isKeyword("for")) {
      const start = this.expectKeyword("for");
      const item = this.expect("IDENT").value;
      this.expectKeyword("in");
      const source = this.parseExpr();
      this.eat("NEWLINE");
      return { kind: "for", item, source, body: this.parseStmtBlock(), span: start.span };
    }
    const start = this.peek();
    const target = this.parsePath();
    this.expect("EQ");
    const value = this.parseExpr();
    this.eat("NEWLINE");
    return { kind: "assign", target, value, span: start.span };
  }

  private parsePropBlock(): Record<string, Expr> {
    const props: Record<string, Expr> = {};
    if (!this.eat("INDENT")) return props;
    while (!this.check("DEDENT") && !this.check("EOF")) {
      this.skipNewlines();
      if (this.check("DEDENT") || this.check("EOF")) break;
      Object.assign(props, this.parsePropLine());
    }
    this.expect("DEDENT");
    return props;
  }

  private parsePropLine(): Record<string, Expr> {
    const key = this.expectOneOf(["IDENT", "KEYWORD"]).value;
    this.expect("COLON");
    const values: Expr[] = [];
    while (
      !this.check("NEWLINE") &&
      !this.check("DEDENT") &&
      !this.check("EOF")
    ) {
      values.push(this.parseExpr());
      this.eat("COMMA");
    }
    this.eat("NEWLINE");
    if (values.length === 0) {
      throw this.error(`missing value for '${key}'`, this.peek().span);
    }
    // Style enums like blend: screen / gradientDir: y should be strings, not lookups.
    const styleEnums = new Set([
      "blend",
      "blendMode",
      "gradientDir",
      "gradientAxis",
      "strokeLinecap",
      "baseline",
      "fontStyle",
      "align",
    ]);
    const coerce = (expr: Expr): Expr => {
      if (
        styleEnums.has(key) &&
        expr.kind === "ident" &&
        expr.path.length === 1 &&
        expr.path[0]
      ) {
        return { kind: "string", value: expr.path[0], span: expr.span };
      }
      return expr;
    };
    if (values.length === 1) return { [key]: coerce(values[0]!) };
    return {
      [key]: { kind: "array", items: values.map(coerce), span: values[0]!.span },
    };
  }

  private parsePath(): string[] {
    const path = [this.expectOneOf(["IDENT", "KEYWORD"]).value];
    while (this.eat("DOT")) {
      path.push(this.expectOneOf(["IDENT", "KEYWORD"]).value);
    }
    return path;
  }

  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isKeyword("or")) {
      const op = this.advance();
      left = {
        kind: "binary",
        op: "or",
        left,
        right: this.parseAnd(),
        span: op.span,
      };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseCmp();
    while (this.isKeyword("and")) {
      const op = this.advance();
      left = {
        kind: "binary",
        op: "and",
        left,
        right: this.parseCmp(),
        span: op.span,
      };
    }
    return left;
  }

  private parseCmp(): Expr {
    let left = this.parseAdd();
    while (this.checkOneOf(["EQEQ", "NEQ", "LT", "GT", "LTE", "GTE"])) {
      const op = this.advance();
      left = {
        kind: "binary",
        op: op.value as BinaryOp,
        left,
        right: this.parseAdd(),
        span: op.span,
      };
    }
    return left;
  }

  private parseAdd(): Expr {
    let left = this.parseMul();
    while (this.checkOneOf(["PLUS", "MINUS"])) {
      const op = this.advance();
      left = {
        kind: "binary",
        op: op.value as BinaryOp,
        left,
        right: this.parseMul(),
        span: op.span,
      };
    }
    return left;
  }

  private parseMul(): Expr {
    let left = this.parseUnary();
    while (this.checkOneOf(["STAR", "SLASH", "PERCENT"])) {
      const op = this.advance();
      left = {
        kind: "binary",
        op: op.value as BinaryOp,
        left,
        right: this.parseUnary(),
        span: op.span,
      };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.isKeyword("not") || this.check("MINUS")) {
      const op = this.advance();
      return {
        kind: "unary",
        op: op.value === "not" ? "not" : "-",
        expr: this.parseUnary(),
        span: op.span,
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const tok = this.peek();
    if (tok.type === "NUMBER") {
      this.advance();
      return { kind: "number", value: Number(tok.value), span: tok.span };
    }
    if (tok.type === "STRING" || tok.type === "COLOR") {
      this.advance();
      return { kind: "string", value: tok.value, span: tok.span };
    }
    if (this.isKeyword("true") || this.isKeyword("false")) {
      this.advance();
      return { kind: "boolean", value: tok.value === "true", span: tok.span };
    }
    if (this.isKeyword("none")) {
      this.advance();
      return { kind: "none", span: tok.span };
    }
    if (tok.type === "IDENT" || (tok.type === "KEYWORD" && !this.isExprKeyword(tok.value))) {
      return { kind: "ident", path: this.parsePath(), span: tok.span };
    }
    if (this.eat("LPAREN")) {
      const expr = this.parseExpr();
      this.expect("RPAREN");
      return expr;
    }
    if (this.check("LBRACK")) return this.parseArray();
    if (this.check("LBRACE")) return this.parseObject();
    throw this.error(`unexpected token '${tok.value || tok.type}'`, tok.span);
  }

  private parseArray(): Expr {
    const start = this.expect("LBRACK");
    this.skipNewlines();
    const items: Expr[] = [];
    while (!this.check("RBRACK") && !this.check("EOF")) {
      items.push(this.parseExpr());
      this.eat("COMMA");
      this.skipNewlines();
    }
    this.expect("RBRACK");
    return { kind: "array", items, span: start.span };
  }

  private parseObject(): Expr {
    const start = this.expect("LBRACE");
    this.skipNewlines();
    const entries: { key: string; value: Expr }[] = [];
    while (!this.check("RBRACE") && !this.check("EOF")) {
      const key = this.expectOneOf(["IDENT", "KEYWORD", "STRING"]).value;
      this.expect("COLON");
      const value = this.parseExpr();
      entries.push({ key, value });
      this.eat("COMMA");
      this.skipNewlines();
    }
    this.expect("RBRACE");
    return { kind: "object", entries, span: start.span };
  }

  private isExprKeyword(value: string): boolean {
    return ["true", "false", "none", "and", "or", "not"].includes(value);
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): Token {
    const tok = this.peek();
    if (tok.type !== "EOF") this.pos += 1;
    return tok;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private checkOneOf(types: TokenType[]): boolean {
    return types.includes(this.peek().type);
  }

  private isKeyword(value: string): boolean {
    const tok = this.peek();
    return tok.type === "KEYWORD" && tok.value === value;
  }

  private eat(type: TokenType): boolean {
    if (!this.check(type)) return false;
    this.advance();
    return true;
  }

  private expect(type: TokenType): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw this.error(`expected ${type}, got '${tok.value || tok.type}'`, tok.span);
    }
    return this.advance();
  }

  private expectOneOf(types: TokenType[]): Token {
    const tok = this.peek();
    if (!types.includes(tok.type)) {
      throw this.error(
        `expected ${types.join(" or ")}, got '${tok.value || tok.type}'`,
        tok.span,
      );
    }
    return this.advance();
  }

  private expectKeyword(value: string): Token {
    const tok = this.peek();
    if (tok.type !== "KEYWORD" || tok.value !== value) {
      throw this.error(`expected '${value}', got '${tok.value || tok.type}'`, tok.span);
    }
    return this.advance();
  }

  private skipNewlines(): void {
    while (this.eat("NEWLINE")) {
      /* skip */
    }
  }

  private error(message: string, span: Span): VivaError {
    const diagnostic: Diagnostic = { message, span, source: this.filename };
    return new VivaError([diagnostic]);
  }
}
