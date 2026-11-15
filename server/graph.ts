import ts from 'typescript';
import path from 'node:path';
import type { Graph, GraphAnalysis, SourceFile } from '../shared/types.js';

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
  if (/\.mjs$/.test(base)) candidates.push(base.replace(/\.mjs$/, '.mts'));
  else if (/\.cjs$/.test(base)) candidates.push(base.replace(/\.cjs$/, '.cts'));
  else if (/\.jsx?$/.test(base))
    candidates.push(base.replace(/\.jsx?$/, '.ts'), base.replace(/\.jsx?$/, '.tsx'));
  return candidates.find((candidate) => paths.has(candidate));
}

export function buildGraph(files: SourceFile[]): Graph {
  const paths = new Set(files.map((file) => file.path));
  const nodes: Graph['nodes'] = [];
  const edges: Graph['edges'] = [];
  const seen = new Set<string>();
  const analysis: GraphAnalysis = {
    version: 1,
    parsedFiles: 0,
    candidateFiles: 0,
    otherFiles: 0,
    unresolvedLocalImports: 0,
    externalImports: 0,
    dynamicImports: 0,
    limitations: [
      'JavaScript y TypeScript: dependencias locales con especificadores literales, leídas mediante sintaxis; no son llamadas ni una traza de ejecución.',
      'Los especificadores de paquetes o alias se cuentan aparte; la resolución de tsconfig, bundlers y dependencias instaladas requiere contexto adicional.',
      'Python: importaciones candidatas por nombres; no se reproduce el entorno ni la ruta de búsqueda de módulos.',
      'Una importación local sin resolver puede apuntar a un archivo excluido, generado o fuera de esta captura.',
      'Los directorios del mapa sirven para navegar. No establecen por sí solos los límites de los componentes de arquitectura.',
      'Cada archivo incluye hasta 30 nombres de declaraciones para orientar la búsqueda; el contenido completo se busca en Código y fuentes.',
    ],
  };
  function edge(source: string, target: string, line: number, kind: string) {
    const id = JSON.stringify([source, target, kind]);
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ id, source, target, kind, line });
  }
  for (const file of files) {
    const symbols: string[] = [];
    const isScript = /\.[cm]?[jt]sx?$/.test(file.path);
    if (isScript) {
      analysis.parsedFiles++;
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
          if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
              (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
            (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))
          )
            analysis.dynamicImports++;
          if (specifier) {
            if (!specifier.startsWith('.')) analysis.externalImports++;
            const target = resolveModule(file.path, specifier, paths);
            if (target)
              edge(
                file.path,
                target,
                parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
                'import',
              );
            else if (specifier.startsWith('.')) analysis.unresolvedLocalImports++;
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
      analysis.candidateFiles++;
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
        else if (!target && dots) analysis.unresolvedLocalImports++;
        else if (!target) analysis.externalImports++;
      });
    } else analysis.otherFiles++;
    nodes.push({
      id: file.path,
      label: path.posix.basename(file.path),
      path: file.path,
      kind: isScript || file.path.endsWith('.py') ? 'module' : file.language || 'file',
      symbols,
    });
  }
  return { nodes, edges, analysis };
}
