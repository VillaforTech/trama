import ts from 'typescript';
import path from 'node:path';
import type { Graph, SourceFile } from '../shared/types.js';

function resolveModule(from: string, specifier: string, paths: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) return;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs', '.json'].map(
      (ext) => base + ext,
    ),
    ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map((file) => base + '/' + file),
  ];
  if (/\.[cm]?jsx?$/.test(base))
    candidates.push(base.replace(/\.[cm]?jsx?$/, '.ts'), base.replace(/\.[cm]?jsx?$/, '.tsx'));
  return candidates.find((candidate) => paths.has(candidate));
}

export function buildGraph(files: SourceFile[]): Graph {
  const paths = new Set(files.map((file) => file.path));
  const nodes: Graph['nodes'] = [];
  const edges: Graph['edges'] = [];
  const seen = new Set<string>();
  function edge(source: string, target: string, line: number, kind: string) {
    const id = source + '|' + target + '|' + kind;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, source, target, kind, line });
  }
  for (const file of files) {
    const symbols: string[] = [];
    const isScript = /\.[cm]?[jt]sx?$/.test(file.path);
    if (isScript) {
      try {
        const parsed = ts.createSourceFile(
          file.path,
          file.text,
          ts.ScriptTarget.Latest,
          true,
          file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
        function walk(node: ts.Node) {
          if (
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node)
          ) {
            if (node.name && symbols.length < 30) symbols.push(node.name.text);
          }
          if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer &&
            (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
            symbols.length < 30
          )
            symbols.push(node.name.text);
          let specifier: string | undefined;
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          )
            specifier = node.moduleSpecifier.text;
          if (
            ts.isCallExpression(node) &&
            node.arguments.length === 1 &&
            ts.isStringLiteral(node.arguments[0]) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
          )
            specifier = node.arguments[0].text;
          if (specifier) {
            const target = resolveModule(file.path, specifier, paths);
            if (target)
              edge(
                file.path,
                target,
                parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
                'import',
              );
          }
          ts.forEachChild(node, walk);
        }
        walk(parsed);
      } catch {
        nodes.push({
          id: file.path,
          label: path.posix.basename(file.path),
          path: file.path,
          kind: 'unparsed',
          symbols: [],
        });
        continue;
      }
    } else if (file.path.endsWith('.py')) {
      const lines = file.text.split(/\r\n|\r|\n/);
      lines.forEach((line, i) => {
        const definition = line.match(/^\s*(?:async\s+)?(?:def|class)\s+([\w]+)/);
        if (definition && symbols.length < 30) symbols.push(definition[1]);
        const match = line.match(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([\w.]+))/);
        if (!match) return;
        const name = match[1] || match[2],
          dots = name.match(/^\.+/)?.[0].length || 0;
        const base = dots
          ? path.posix.join(
              path.posix.dirname(file.path),
              ...Array(dots - 1).fill('..'),
              name.slice(dots).replaceAll('.', '/'),
            )
          : name.replaceAll('.', '/');
        const target = [
          base + '.py',
          base + '/__init__.py',
          'src/' + base + '.py',
          'src/' + base + '/__init__.py',
        ].find((p) => paths.has(p));
        if (target && target !== file.path)
          edge(file.path, target, i + 1, 'python-import-candidate');
      });
    }
    nodes.push({
      id: file.path,
      label: path.posix.basename(file.path),
      path: file.path,
      kind: isScript || file.path.endsWith('.py') ? 'module' : file.language || 'file',
      symbols,
    });
  }
  return { nodes, edges };
}
