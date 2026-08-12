/**
 * @fileoverview Builds reusable control-flow graphs for Oxray rules.
 *
 * The graph uses Oxlint ESTree nodes and visitor keys. This design lets all rules share one
 * analysis without a second parser or changes to the source AST.
 */
import { isAstNode } from "../rules/ast-nodes.ts";
import type { AstNode, VisitorKeys } from "../rules/types.ts";

export type ControlFlowEdgeKind = "abrupt" | "branch" | "continue" | "fallthrough" | "normal";

export interface ControlFlowEdge {
  from: BasicBlock;
  kind: ControlFlowEdgeKind;
  to: BasicBlock;
}

export interface BasicBlock {
  id: number;
  nodes: AstNode[];
  predecessors: ControlFlowEdge[];
  successors: ControlFlowEdge[];
}

export interface FunctionControlFlowGraph {
  blocks: BasicBlock[];
  cyclomaticComplexity: number;
  entry: BasicBlock;
  exit: BasicBlock;
  owner: AstNode;
  blockOf(node: AstNode): BasicBlock | null;
}

export interface ControlFlowAnalysis {
  cfgFor(owner: AstNode): FunctionControlFlowGraph | null;
  dominanceFrontier(node: AstNode): BasicBlock[];
  dominates(first: AstNode, second: AstNode): boolean;
  enclosingFunction(node: AstNode): AstNode | null;
  isInsideLoop(node: AstNode): boolean;
  isReachable(from: AstNode, to: AstNode): boolean;
  isUnconditionalFromEntry(node: AstNode): boolean;
  isUnreachable(node: AstNode): boolean;
  postDominates(later: AstNode, earlier: AstNode): boolean;
  toDot(owner: AstNode): string | null;
}

interface BuildContext {
  breakTarget: BasicBlock | null;
  continueTarget: BasicBlock | null;
}

interface GraphBuilder {
  blocks: BasicBlock[];
  entry: BasicBlock;
  exit: BasicBlock;
  nextId: number;
  nodeBlocks: WeakMap<AstNode, BasicBlock>;
  visitorKeys: VisitorKeys;
}

interface LocatedNode {
  block: BasicBlock;
  graph: FunctionControlFlowGraph;
  owner: AstNode;
}

interface DerivedGraphData {
  cyclic: Set<BasicBlock>;
  dominators: Map<BasicBlock, Set<BasicBlock>>;
  postDominators: Map<BasicBlock, Set<BasicBlock>>;
  reachable: Set<BasicBlock>;
}

const analysisCache = new WeakMap<AstNode, ControlFlowAnalysis>();

const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

function forEachChild(
  node: AstNode,
  visitorKeys: VisitorKeys,
  visit: (child: AstNode) => void,
): void {
  for (const key of visitorKeys[node.type] ?? []) {
    const value = Reflect.get(node, key);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          visit(item);
        }
      }
    } else if (isAstNode(value)) {
      visit(value);
    }
  }
}

function createBlock(builder: GraphBuilder, node?: AstNode): BasicBlock {
  const block: BasicBlock = {
    id: builder.nextId,
    nodes: node ? [node] : [],
    predecessors: [],
    successors: [],
  };
  builder.nextId += 1;
  builder.blocks.push(block);
  if (node) {
    builder.nodeBlocks.set(node, block);
  }
  return block;
}

function connect(from: BasicBlock, to: BasicBlock, kind: ControlFlowEdgeKind = "normal"): void {
  if (from.successors.some((edge) => edge.to === to && edge.kind === kind)) {
    return;
  }
  const edge = { from, kind, to };
  from.successors.push(edge);
  to.predecessors.push(edge);
}

function appendNode(builder: GraphBuilder, incoming: BasicBlock[], node: AstNode): BasicBlock {
  const block = createBlock(builder, node);
  for (const predecessor of incoming) {
    connect(predecessor, block);
  }
  mapUnclaimedDescendants(builder, node, block);
  return block;
}

function mapUnclaimedDescendants(builder: GraphBuilder, node: AstNode, block: BasicBlock): void {
  const visit = (child: AstNode): void => {
    if (functionTypes.has(child.type)) {
      builder.nodeBlocks.set(child, block);
      return;
    }
    builder.nodeBlocks.set(child, block);
    forEachChild(child, builder.visitorKeys, visit);
  };
  forEachChild(node, builder.visitorKeys, visit);
}

function buildExpression(
  builder: GraphBuilder,
  expression: AstNode | null | undefined,
  incoming: BasicBlock[],
): BasicBlock[] {
  if (!expression) {
    return incoming;
  }

  if (expression.type === "ConditionalExpression") {
    const testExits = buildExpression(builder, expression.test as AstNode, incoming);
    const branch = appendNode(builder, testExits, expression);
    const consequent = buildExpression(builder, expression.consequent as AstNode, [branch]);
    const alternate = buildExpression(builder, expression.alternate as AstNode, [branch]);
    const join = createBlock(builder);
    for (const exit of consequent) {
      connect(exit, join, "branch");
    }
    for (const exit of alternate) {
      connect(exit, join, "branch");
    }
    return [join];
  }

  if (
    expression.type === "LogicalExpression" ||
    (expression.type === "AssignmentExpression" &&
      ["&&=", "||=", "??="].includes(expression.operator ?? ""))
  ) {
    const leftExits = buildExpression(builder, expression.left as AstNode, incoming);
    const branch = appendNode(builder, leftExits, expression);
    const rightExits = buildExpression(builder, expression.right as AstNode, [branch]);
    const join = createBlock(builder);
    connect(branch, join, "branch");
    for (const exit of rightExits) {
      connect(exit, join, "branch");
    }
    return [join];
  }

  if (
    (expression.type === "CallExpression" || expression.type === "MemberExpression") &&
    expression.optional === true
  ) {
    const branch = appendNode(builder, incoming, expression);
    const join = createBlock(builder);
    connect(branch, join, "branch");
    const evaluated = createBlock(builder);
    connect(branch, evaluated, "branch");
    connect(evaluated, join);
    return [join];
  }

  return [appendNode(builder, incoming, expression)];
}

function buildSequence(
  builder: GraphBuilder,
  statements: AstNode[],
  incoming: BasicBlock[],
  context: BuildContext,
): BasicBlock[] {
  let exits = incoming;
  for (const statement of statements) {
    exits = buildStatement(builder, statement, exits, context);
  }
  return exits;
}

function statementBody(node: AstNode): AstNode[] {
  return Array.isArray(node.body) ? node.body : [];
}

function buildLoop(
  builder: GraphBuilder,
  statement: AstNode,
  incoming: BasicBlock[],
): BasicBlock[] {
  const loop = appendNode(builder, incoming, statement);
  const after = createBlock(builder);
  const bodyEntry = createBlock(builder);
  connect(loop, bodyEntry, "branch");
  connect(loop, after, "branch");
  const body = statement.body;
  const bodyExits = isAstNode(body)
    ? buildStatement(builder, body, [bodyEntry], {
        breakTarget: after,
        continueTarget: loop,
      })
    : [bodyEntry];
  for (const exit of bodyExits) {
    connect(exit, loop, "continue");
  }
  return [after];
}

function buildSwitch(
  builder: GraphBuilder,
  statement: AstNode,
  incoming: BasicBlock[],
): BasicBlock[] {
  const discriminantExits = buildExpression(builder, statement.discriminant as AstNode, incoming);
  const branch = appendNode(builder, discriminantExits, statement);
  const after = createBlock(builder);
  const cases = Array.isArray(statement.cases) ? (statement.cases as AstNode[]) : [];
  let fallthrough: BasicBlock[] = [];
  let hasDefault = false;
  for (const switchCase of cases) {
    if (!switchCase.test) {
      hasDefault = true;
    }
    const entry = createBlock(builder, switchCase);
    connect(branch, entry, "branch");
    for (const prior of fallthrough) {
      connect(prior, entry, "fallthrough");
    }
    fallthrough = buildSequence(
      builder,
      Array.isArray(switchCase.consequent) ? (switchCase.consequent as AstNode[]) : [],
      [entry],
      { breakTarget: after, continueTarget: null },
    );
  }
  for (const exit of fallthrough) {
    connect(exit, after);
  }
  if (!hasDefault) {
    connect(branch, after, "branch");
  }
  return [after];
}

function buildTry(
  builder: GraphBuilder,
  statement: AstNode,
  incoming: BasicBlock[],
  context: BuildContext,
): BasicBlock[] {
  const anchor = appendNode(builder, incoming, statement);
  const tryExits = isAstNode(statement.block)
    ? buildStatement(builder, statement.block, [anchor], context)
    : [anchor];
  const handlerBody = isAstNode(statement.handler) ? statement.handler.body : null;
  const handlerExits = isAstNode(handlerBody)
    ? buildStatement(builder, handlerBody, [anchor], context)
    : [];
  const combined = [...tryExits, ...handlerExits];
  if (isAstNode(statement.finalizer)) {
    return buildStatement(builder, statement.finalizer, combined, context);
  }
  return combined;
}

function buildStatement(
  builder: GraphBuilder,
  statement: AstNode,
  incoming: BasicBlock[],
  context: BuildContext,
): BasicBlock[] {
  if (incoming.length === 0) {
    const unreachable = createBlock(builder, statement);
    mapUnclaimedDescendants(builder, statement, unreachable);
    return [];
  }

  switch (statement.type) {
    case "BlockStatement":
    case "Program":
      return buildSequence(builder, statementBody(statement), incoming, context);
    case "ExpressionStatement":
      return buildExpression(builder, statement.expression as AstNode, incoming);
    case "VariableDeclaration": {
      let exits = incoming;
      for (const declaration of (statement.declarations ?? []) as AstNode[]) {
        exits = buildExpression(builder, declaration.init, exits);
      }
      return [appendNode(builder, exits, statement)];
    }
    case "IfStatement": {
      const testExits = buildExpression(builder, statement.test as AstNode, incoming);
      const branch = appendNode(builder, testExits, statement);
      const consequent = isAstNode(statement.consequent)
        ? buildStatement(builder, statement.consequent, [branch], context)
        : [branch];
      const alternate = isAstNode(statement.alternate)
        ? buildStatement(builder, statement.alternate, [branch], context)
        : [branch];
      const join = createBlock(builder);
      for (const exit of [...consequent, ...alternate]) {
        connect(exit, join, "branch");
      }
      return [join];
    }
    case "DoWhileStatement":
    case "ForInStatement":
    case "ForOfStatement":
    case "ForStatement":
    case "WhileStatement":
      return buildLoop(builder, statement, incoming);
    case "SwitchStatement":
      return buildSwitch(builder, statement, incoming);
    case "TryStatement":
      return buildTry(builder, statement, incoming, context);
    case "ReturnStatement":
    case "ThrowStatement": {
      const expressionExits = buildExpression(builder, statement.argument, incoming);
      const abrupt = appendNode(builder, expressionExits, statement);
      connect(abrupt, builder.exit, "abrupt");
      return [];
    }
    case "BreakStatement": {
      const abrupt = appendNode(builder, incoming, statement);
      if (context.breakTarget) {
        connect(abrupt, context.breakTarget, "abrupt");
      }
      return [];
    }
    case "ContinueStatement": {
      const abrupt = appendNode(builder, incoming, statement);
      if (context.continueTarget) {
        connect(abrupt, context.continueTarget, "continue");
      }
      return [];
    }
    case "LabeledStatement":
      return isAstNode(statement.body)
        ? buildStatement(builder, statement.body, incoming, context)
        : incoming;
    default:
      return [appendNode(builder, incoming, statement)];
  }
}

function buildGraph(
  owner: AstNode,
  body: AstNode,
  visitorKeys: VisitorKeys,
): FunctionControlFlowGraph {
  const entry: BasicBlock = { id: 0, nodes: [owner], predecessors: [], successors: [] };
  const exit: BasicBlock = { id: 1, nodes: [], predecessors: [], successors: [] };
  const nodeBlocks = new WeakMap<AstNode, BasicBlock>();
  nodeBlocks.set(owner, entry);
  const builder: GraphBuilder = {
    blocks: [entry, exit],
    entry,
    exit,
    nextId: 2,
    nodeBlocks,
    visitorKeys,
  };
  const exits =
    body.type === "Program" || body.type === "BlockStatement"
      ? buildSequence(builder, statementBody(body), [builder.entry], {
          breakTarget: null,
          continueTarget: null,
        })
      : buildExpression(builder, body, [builder.entry]);
  for (const exit of exits) {
    connect(exit, builder.exit);
  }
  const reachable = reachableFrom(builder.entry);
  const reachableEdges = [...reachable].reduce(
    (count, block) => count + block.successors.filter((edge) => reachable.has(edge.to)).length,
    0,
  );
  const cyclomaticComplexity = Math.max(1, reachableEdges - reachable.size + 2);
  return {
    blocks: builder.blocks,
    cyclomaticComplexity,
    entry: builder.entry,
    exit: builder.exit,
    owner,
    blockOf: (node) => builder.nodeBlocks.get(node) ?? null,
  };
}

function reachableFrom(start: BasicBlock): Set<BasicBlock> {
  const visited = new Set<BasicBlock>();
  const queue = [start];
  while (queue.length > 0) {
    const block = queue.pop()!;
    if (visited.has(block)) {
      continue;
    }
    visited.add(block);
    for (const edge of block.successors) {
      queue.push(edge.to);
    }
  }
  return visited;
}

function canReach(from: BasicBlock, target: BasicBlock): boolean {
  return reachableFrom(from).has(target);
}

function intersection(sets: Set<BasicBlock>[]): Set<BasicBlock> {
  if (sets.length === 0) {
    return new Set();
  }
  const [first, ...rest] = sets;
  return new Set([...first!].filter((block) => rest.every((set) => set.has(block))));
}

function computeDominators(
  blocks: Set<BasicBlock>,
  root: BasicBlock,
  incoming: (block: BasicBlock) => BasicBlock[],
): Map<BasicBlock, Set<BasicBlock>> {
  const dominators = new Map<BasicBlock, Set<BasicBlock>>();
  for (const block of blocks) {
    dominators.set(block, block === root ? new Set([root]) : new Set(blocks));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const block of blocks) {
      if (block === root) {
        continue;
      }
      const predecessors = incoming(block).filter((candidate) => blocks.has(candidate));
      const next = intersection(predecessors.map((candidate) => dominators.get(candidate)!));
      next.add(block);
      const current = dominators.get(block)!;
      if (next.size !== current.size || [...next].some((candidate) => !current.has(candidate))) {
        dominators.set(block, next);
        changed = true;
      }
    }
  }
  return dominators;
}

function derive(graph: FunctionControlFlowGraph): DerivedGraphData {
  const reachable = reachableFrom(graph.entry);
  const canExit = new Set(graph.blocks.filter((block) => canReach(block, graph.exit)));
  const dominators = computeDominators(reachable, graph.entry, (block) =>
    block.predecessors.map((edge) => edge.from),
  );
  const postDominators = computeDominators(canExit, graph.exit, (block) =>
    block.successors.map((edge) => edge.to),
  );
  const cyclic = new Set<BasicBlock>();
  for (const block of reachable) {
    if (block.successors.some((edge) => edge.to === block || canReach(edge.to, block))) {
      cyclic.add(block);
    }
  }
  return { cyclic, dominators, postDominators, reachable };
}

function dot(graph: FunctionControlFlowGraph): string {
  const lines = ['digraph "cfg" {'];
  for (const block of graph.blocks) {
    const label = block.nodes.map((node) => node.type).join("\\n") || "empty";
    lines.push(`  b${block.id} [label="${label}"];`);
  }
  for (const block of graph.blocks) {
    for (const edge of block.successors) {
      lines.push(`  b${block.id} -> b${edge.to.id} [label="${edge.kind}"];`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

function buildAnalysis(program: AstNode, visitorKeys: VisitorKeys): ControlFlowAnalysis {
  const graphs = new Map<AstNode, FunctionControlFlowGraph>();
  const owners = new WeakMap<AstNode, AstNode>();
  const derived = new WeakMap<FunctionControlFlowGraph, DerivedGraphData>();

  const register = (owner: AstNode, body: AstNode): void => {
    graphs.set(owner, buildGraph(owner, body, visitorKeys));
  };
  register(program, program);

  const visit = (node: AstNode, owner: AstNode): void => {
    owners.set(node, owner);
    if (node !== owner && functionTypes.has(node.type) && isAstNode(node.body)) {
      register(node, node.body);
      owners.set(node, node);
      forEachChild(node.body, visitorKeys, (child) => visit(child, node));
      return;
    }
    forEachChild(node, visitorKeys, (child) => visit(child, owner));
  };
  visit(program, program);

  const dataFor = (graph: FunctionControlFlowGraph): DerivedGraphData => {
    let data = derived.get(graph);
    if (!data) {
      data = derive(graph);
      derived.set(graph, data);
    }
    return data;
  };

  const locate = (node: AstNode): LocatedNode | null => {
    const owner = owners.get(node);
    if (!owner) {
      return null;
    }
    const graph = graphs.get(owner);
    const block = graph?.blockOf(node);
    return graph && block ? { block, graph, owner } : null;
  };

  return {
    cfgFor: (owner) => graphs.get(owner) ?? null,
    dominanceFrontier(node) {
      const located = locate(node);
      if (!located) {
        return [];
      }
      const data = dataFor(located.graph);
      return located.graph.blocks.filter((candidate) => {
        const predecessors = candidate.predecessors.map((edge) => edge.from);
        return (
          predecessors.length > 1 &&
          predecessors.some((predecessor) =>
            data.dominators.get(predecessor)?.has(located.block),
          ) &&
          (candidate === located.block || !data.dominators.get(candidate)?.has(located.block))
        );
      });
    },
    dominates(first, second) {
      const firstLocation = locate(first);
      const secondLocation = locate(second);
      return Boolean(
        firstLocation &&
        secondLocation &&
        firstLocation.owner === secondLocation.owner &&
        dataFor(firstLocation.graph).dominators.get(secondLocation.block)?.has(firstLocation.block),
      );
    },
    enclosingFunction: (node) => owners.get(node) ?? null,
    isInsideLoop(node) {
      const located = locate(node);
      return Boolean(located && dataFor(located.graph).cyclic.has(located.block));
    },
    isReachable(from, to) {
      const fromLocation = locate(from);
      const toLocation = locate(to);
      return Boolean(
        fromLocation &&
        toLocation &&
        fromLocation.owner === toLocation.owner &&
        canReach(fromLocation.block, toLocation.block),
      );
    },
    isUnconditionalFromEntry(node) {
      const located = locate(node);
      return Boolean(
        located && dataFor(located.graph).dominators.get(located.graph.exit)?.has(located.block),
      );
    },
    isUnreachable(node) {
      const located = locate(node);
      return Boolean(located && !dataFor(located.graph).reachable.has(located.block));
    },
    postDominates(later, earlier) {
      const laterLocation = locate(later);
      const earlierLocation = locate(earlier);
      return Boolean(
        laterLocation &&
        earlierLocation &&
        laterLocation.owner === earlierLocation.owner &&
        dataFor(laterLocation.graph)
          .postDominators.get(earlierLocation.block)
          ?.has(laterLocation.block),
      );
    },
    toDot: (owner) => {
      const graph = graphs.get(owner);
      return graph ? dot(graph) : null;
    },
  };
}

/** Builds one cached analysis per program so multiple rules share the same graph. */
export function getControlFlow(program: AstNode, visitorKeys: VisitorKeys): ControlFlowAnalysis {
  let analysis = analysisCache.get(program);
  if (!analysis) {
    analysis = buildAnalysis(program, visitorKeys);
    analysisCache.set(program, analysis);
  }
  return analysis;
}
