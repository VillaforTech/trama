/* Local, bounded source analysis for Trama. The input text is never executed. */
'use strict';
const GROUP_LIMIT = 7;
const FILE_LIMIT = 4000;
const LINE_LIMIT = 20000;
const MAX_LINE = 1600;
const K = { source: 'source', inferred: 'inferred', unknown: 'unknown' };
const impl = /\.(py|[cm]?[jt]sx?|go|rs|rb|php|java|kt|swift|c|cpp|cc|cs)$/i;
const docs = /\.(mdx?|markdown|rst|adoc|txt)$/i;
const collateral =
  /(?:^|\/)(?:licenses?|copying|copyright|security|changelog|changes|history|code_of_conduct|contributing|agents)(?:\.\w+)?$/i;
const aux =
  /(^|\/)(tests?|specs?|__tests__|fixtures|samples?|examples?|benchmarks?|scripts\/test)(\/|$)|\.(?:test(?:-d)?|spec)\.[^.]+$|(^|\/)(?:tests?|spec|bench(?:mark(?:er)?)?)\.[^.]+$|(^|\/)test_[^/]+\.py$/i;
const thirdParty =
  /(?:^|\/)(?:node_modules|\.git|dist|build|__pycache__|target|\.venv|vendor|third_party|lcov-report)(?:\/|$)/i;
const manifests =
  /(^|\/)(package\.json|pyproject\.toml|setup\.cfg|setup\.py|Cargo\.toml|go\.mod|Gemfile|pom\.xml|Package\.swift|composer\.json)$/i;
const ignoreName =
  /^(if|else|for|while|switch|catch|return|with|match|function|assert|async|try|except|select|map|filter)$/;
const boring =
  /^(?:main|new|init|setup|run|close|setup_method|test_.+|toString|__.+__|constructor|build|index|default|update|get|set|add|remove|read|write)$/i;
const rootname = (p) => p.split('/').pop() || p;
const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const plain = (s) =>
  String(s || '')
    .replace(/<[^<>\n]{1,80}>/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_\x60<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const limited = (s, n = 125) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const norm = (p) => {
  const a = [];
  for (const t of p.split('/')) {
    if (!t || t === '.') continue;
    if (t === '..') a.pop();
    else a.push(t);
  }
  return a.join('/');
};
const id = (prefix, s) => {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return prefix + '-' + (h >>> 0).toString(36);
};
const words = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/);
const friendly = (s) => {
  const w = words(s);
  return w.join(' ') || s;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rank = (a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line;
const unique = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const sourceKey = (s) => s.path + '#' + s.line + '-' + s.end;
const joinAnchors = (...parts) => unique(parts.flat().filter(Boolean), sourceKey).slice(0, 5);
function makeDoc(item) {
  const path = String(item.path || '').replace(/^\.\//, ''),
    raw = item.text;
  if (
    !path ||
    typeof raw !== 'string' ||
    !raw.trim() ||
    /\u0000/.test(raw) ||
    thirdParty.test(path)
  )
    return null;
  const rows = [],
    starts = [];
  const re = /([^\r\n]*)(?:\r\n|\n|\r|$)/g;
  let m;
  while (rows.length < LINE_LIMIT && (m = re.exec(raw)) && m[0].length) {
    starts.push(m.index);
    rows.push(m[1]);
  }
  if (!rows.length) return null;
  return {
    path,
    raw,
    rows,
    starts,
    ext: rootname(path).split('.').pop().toLowerCase(),
    aux: aux.test(path),
    defs: [],
    imports: new Map(),
    points: [],
    codeLines: new Set(),
  };
}
function point(d, type, name, line, score, detail = {}, end = line) {
  return { d, type, name, line, end, path: d.path, score, ...detail };
}
function symbolAt(line, d) {
  const t = line.trim();
  let m;
  if (d.ext === 'py') {
    m = t.match(/^(?:async\s+)?(def|class)\s+([\w]+)\b/);
    return m && { name: m[2], type: m[1] === 'class' ? 'class' : 'fn' };
  }
  if (/^[cm]?[jt]sx?$/.test(d.ext)) {
    m =
      t.match(
        /^(?:(?:export|default|declare|abstract|async|public|private|protected|static)\s+)*(function\s*\*?|class|interface)\s+([\w$]+)/,
      ) ||
      t.match(
        /^(?:export\s+)?(const|let)\s+([\w$]+)\s*(?::[^=]{1,100})?=\s*(?:async\s*)?(?:function\b|(?:\([^)]{0,300}\)|[\w$]+)\s*(?::[^=]+)?=>)/,
      );
    if (m) return { name: m[2], type: ['class', 'interface'].includes(m[1]) ? 'class' : 'fn' };
    m = t.match(/^(?:(?:[\w$]+\.)+)([\w$]+)\s*=\s*(?:async\s+)?function\b/);
    if (m) return { name: m[1], type: 'fn' };
    m = t.match(
      /^(?:(?:async|static|private|public|protected)\s+)*([\w$]+)\s*\([^)]{0,240}\)\s*(?::[^{};]+)?\s*\{/,
    );
    if (m && !ignoreName.test(m[1])) return { name: m[1], type: 'fn' };
    return null;
  }
  if (d.ext === 'go') {
    m = t.match(/^func\s+(?:\([^)]*\)\s*)?([\w]+)\s*[(\[]/);
  } else if (d.ext === 'rs') {
    m = t.match(/^(?:(?:pub(?:\([^)]*\))?|async|unsafe|const)\s+)*fn\s+(\w+)/);
  } else if (d.ext === 'rb') {
    m = t.match(/^def\s+(?:self\.)?([\w!?]+)/);
  } else if (d.ext === 'swift') {
    m = t.match(/^(?:(?:public|static|private|override|open|final|class)\s+)*func\s+(\w+)/);
  } else if (['php', 'kt'].includes(d.ext)) {
    m = t.match(
      /^(?:(?:public|private|static|suspend|protected|override|open|async)\s+)*(?:fun|function)\s+(\w+)/,
    );
  }
  return m && { name: m[1], type: 'fn' };
}
function spanEnd(d, s) {
  const start = s.line - 1,
    stop = Math.min(d.rows.length, start + 125);
  const indentation = (d.rows[start].match(/^\s*/) || [''])[0].replace(/\t/g, '    ').length;
  if (d.ext === 'py') {
    let last = s.line;
    for (let i = start + 1; i < stop; i++) {
      const l = d.rows[i];
      if (!d.codeLines.has(i + 1)) continue;
      const n = (l.match(/^\s*/) || [''])[0].replace(/\t/g, '    ').length;
      if (n <= indentation && !/^[)\]}]/.test(l.trimStart())) break;
      last = i + 1;
    }
    return last;
  }
  let open = 0,
    touched = false;
  for (let i = start; i < stop; i++) {
    const visible = d.rows[i]
      .replace(/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '')
      .split('//')[0];
    for (const c of visible) {
      if (c === '{') {
        open++;
        touched = true;
      } else if (c === '}') open--;
    }
    if (touched && open <= 0) return i + 1;
    if (
      !touched &&
      (i === start + 4 || (visible.includes('=>') && visible.trimEnd().endsWith(';')))
    )
      return i + 1;
    if (i > start + 1 && d.defs.some((x) => x.line === i + 1)) return i;
  }
  return Math.min(s.line + 7, stop);
}
function extract(d) {
  let heading = '',
    inFence = false,
    manifestSection = '',
    block = '',
    propertyScope = null;
  if (rootname(d.path) === 'package.json') {
    try {
      const pkg = JSON.parse(d.raw);
      const bins =
        typeof pkg.bin === 'string'
          ? [
              [
                String(pkg.name || '')
                  .split('/')
                  .pop(),
                pkg.bin,
              ],
            ]
          : Object.entries(pkg.bin || {});
      for (const [name, target] of bins) {
        if (!name || typeof target !== 'string') continue;
        const line = d.rows.findIndex(
          (l) =>
            l.length <= MAX_LINE &&
            l.includes(JSON.stringify(target)) &&
            (l.includes(JSON.stringify(name)) || l.includes('"bin"')),
        );
        if (line >= 0)
          d.points.push(point(d, 'entry', name, line + 1, 100, { target, fileTarget: true }));
      }
    } catch {
      /* A partial JSON file still exposes the line-based manifest references below. */
    }
  }
  for (let i = 0; i < d.rows.length; i++) {
    const raw = d.rows[i];
    if (raw.length > MAX_LINE) continue;
    const t = raw.trim(),
      ln = i + 1;
    if (!t) continue;
    let m;
    if (docs.test(d.path)) {
      if (/^(```|~~~)/.test(t)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      m = t.match(/^(#{1,4})\s+(.+)$/);
      if (m) {
        heading = limited(plain(m[2]), 85);
        if (
          m[1].length > 1 &&
          !/^(?:usage|installation|install|contributing|changelog|licen[cs]e|table of contents|requirements|development|contents|getting started|features|quick ?start|tests?|prerequisites)$/i.test(
            heading,
          )
        )
          d.points.push(point(d, 'doc', heading, ln, 29));
      } else if (
        /^features|capabilit|funcionalidad|característic/i.test(heading) &&
        (m = t.match(/^[-*]\s+(.+)/))
      ) {
        d.points.push(point(d, 'doc', limited(plain(m[1]), 85), ln, 33));
      }
      continue;
    }
    if (impl.test(d.path)) {
      if (block) {
        if (t.includes(block)) block = '';
        continue;
      }
      if (d.ext === 'py') {
        const quoted = t.match(/(?:^|[=(,:]\s*|\breturn\s+)(?:[rubf]{0,2})("""|''')/i);
        if (quoted) {
          if (!t.slice(quoted.index + quoted[0].length).includes(quoted[1])) block = quoted[1];
          continue;
        }
        if (t.startsWith('#')) continue;
      } else if (t.startsWith('/*')) {
        if (!t.slice(2).includes('*/')) block = '*/';
        continue;
      } else if (t.startsWith('//')) continue;
      d.codeLines.add(ln);
    }
    if (manifests.test(d.path)) {
      const section = t.match(/^\[([^\]]+)\]/);
      if (section) manifestSection = section[1];
      if (
        /^(?:project\.scripts|tool\.poetry\.scripts|options\.entry_points)$/.test(
          manifestSection,
        ) &&
        (m = t.match(/^["']?([\w.-]+)["']?\s*=\s*["']?([\w.:]+)/))
      )
        d.points.push(point(d, 'entry', m[1], ln, 100, { target: m[2] }));
      if (
        /["'](?:main|module|bin|exports)["']\s*:/.test(t) ||
        /\[\[(?:bin|example)\]\]/.test(t) ||
        /^package\s+main\b/.test(t)
      )
        d.points.push(point(d, 'manifest', rootname(d.path), ln, 42));
    }
    if (
      d.ext === 'sql' &&
      (m = t.match(
        /\b(CREATE(?:\s+OR\s+REPLACE)?\s+(?:MATERIALIZED\s+VIEW|TABLE|VIEW|FUNCTION|PROCEDURE))\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?([\w.]+)/i,
      ))
    )
      d.points.push(point(d, 'schema', m[2], ln, 67, { operation: m[1].toUpperCase() }));
    if (!impl.test(d.path)) continue;
    const def = symbolAt(raw, d);
    if (def) d.defs.push(point(d, def.type, def.name, ln, def.type === 'class' ? 44 : 50));
    if (/^[cm]?[jt]s$/.test(d.ext)) {
      const indent = raw.match(/^\s*/)[0].length;
      if (propertyScope && indent <= propertyScope.indent) propertyScope = null;
      const scope = t.match(/^Object\.defineProperties\(\s*([\w$]+)\s*,\s*\{/);
      if (scope) propertyScope = { owner: scope[1], indent, depth: null };
      else if (propertyScope) {
        const match = t.match(/^([\w$]+):\s*\{/);
        if (match && (propertyScope.depth === null || propertyScope.depth === indent)) {
          propertyScope.depth = indent;
          d.points.push(
            point(d, 'api', propertyScope.owner + '.' + match[1], ln, 76, {
              property: match[1],
              inline: true,
            }),
          );
        }
      }
    }
    if (/^\s*(?:#(?!\[)|\/\/|\/\*|\*|"""|\x27\x27\x27)/.test(raw)) continue;
    const route = t.match(
      /(?:@(?:[\w.]+)|\b(?:router|app|server|api|fastify|bp|blueprint|web))\.(get|post|put|delete|patch|head|options|route|all)\s*\(\s*["']([^"']{1,130})["']/i,
    );
    const goRoute = t.match(/\b(?:http\.)?HandleFunc\(\s*"([^"]+)"\s*,\s*([\w.]+)/);
    if (route && (route[2].startsWith('/') || route[2] === '*')) {
      let verb = route[1].toUpperCase();
      if (verb === 'ROUTE') {
        const methods = t.match(/methods\s*=\s*\[([^\]]+)\]/);
        verb = methods
          ? Array.from(methods[1].matchAll(/["']([A-Za-z]+)["']/g), (x) => x[1].toUpperCase()).join(
              '/',
            )
          : 'ROUTE';
      }
      const tail = t.slice(route.index + route[0].length);
      const named = tail.match(/^\s*,\s*([\w$]+(?:\.[\w$]+)?)\s*[,)]/);
      d.points.push(
        point(d, 'route', verb + ' ' + route[2], ln, 96, {
          routePath: route[2],
          callback: named?.[1],
          inline: /=>\s*\{|function\s*\(/.test(tail),
        }),
      );
    } else if (goRoute)
      d.points.push(
        point(d, 'route', goRoute[1], ln, 95, {
          routePath: goRoute[1].replace(/^\w+\s+/, ''),
          callback: goRoute[2],
        }),
      );
    else if (
      def &&
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(def.name) &&
      /(^|\/)app\/(?:.+\/)?route\.[cm]?[jt]s$/.test(d.path)
    ) {
      const url = '/' + d.path.replace(/^.*?\bapp\//, '').replace(/(?:^|\/)route\.[^.]+$/, '');
      d.points.push(
        point(d, 'route', def.name + ' ' + url, ln, 94, { routePath: url, handler: ln }),
      );
    }
    m = t.match(/(?:@(?:[\w.]+)\.command|\.add_parser|\.command)\(\s*["']([^"']{1,90})["']/);
    if (m) d.points.push(point(d, 'command', m[1], ln, 96));
    else if (/^@(?:[\w.]+)\.(?:command|group)\(\s*\)/.test(t)) {
      const next = d.rows
        .slice(i + 1, i + 11)
        .map((s, idx) => ({ m: s.match(/^\s*(?:async\s+)?def\s+(\w+)/), ix: i + idx + 2 }))
        .find((x) => x.m);
      if (next)
        d.points.push(
          point(d, 'command', next.m[1].replace(/_/g, '-'), ln, 93, { handler: next.ix }),
        );
    }
    if (
      /if\s+__name__\s*==\s*["']__main__["']|\b(?:app|server)\.listen\s*\(|^(?:async\s+)?fn\s+main\s*\(|^func\s+main\(\)/.test(
        t,
      )
    )
      d.points.push(point(d, 'boot', 'Punto de inicio', ln, 76));
  }
  for (const s of d.defs) {
    s.end = spanEnd(d, s);
    if (d.ext === 'py') {
      const bodyStart = d.rows.slice(s.line, Math.min(s.line + 8, s.end));
      const ix = bodyStart.findIndex((l) => /^\s*(?:r|u)?(?:"""|''')/i.test(l));
      if (ix >= 0) {
        const raw = bodyStart[ix]
          .trim()
          .replace(/^(?:r|u)?(?:"""|''')/i, '')
          .split(/"""|'''/)[0];
        if (raw.length > 12 && raw.length <= MAX_LINE) {
          s.docLine = s.line + ix + 1;
          s.docText = raw.trim();
        }
      }
    }
  }
  if (
    manifests.test(d.path) &&
    !d.points.some((p) => p.type === 'manifest' || p.type === 'entry')
  ) {
    const index = d.rows.findIndex((x) =>
      /["'](?:name|version)["']\s*:|^\[(?:project|package|tool\.)|^module\s+/.test(x.trim()),
    );
    if (index >= 0) d.points.push(point(d, 'manifest', rootname(d.path), index + 1, 40));
  }
  if (docs.test(d.path) && !d.points.length) {
    const li = d.rows.findIndex(
      (l) => l.trim() && l.length < MAX_LINE && !/^(?:<|!\[|\[!|---|===|\.\. )/.test(l.trim()),
    );
    if (li >= 0)
      d.points.push(
        point(
          d,
          'doc',
          limited(plain(d.rows[li]).replace(/^#+\s*/, ''), 70) || rootname(d.path),
          li + 1,
          18,
        ),
      );
  }
}
function findFile(index, candidates) {
  const dirs = ['', 'src/', 'lib/', 'packages/'];
  for (const b of candidates) {
    if (!b) continue;
    const normalized = norm(b);
    for (const prefix of dirs) {
      const f = prefix + normalized;
      for (const suff of [
        '',
        '.py',
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mjs',
        '.cjs',
        '.rs',
        '/__init__.py',
        '/index.ts',
        '/index.tsx',
        '/index.js',
      ]) {
        const x = index.get(f + suff);
        if (x) return x;
      }
    }
  }
  return null;
}
function imports(d, index) {
  for (let i = 0; i < d.rows.length; i++) {
    const raw = d.rows[i];
    if (raw.length > MAX_LINE || !d.codeLines.has(i + 1)) continue;
    const t = raw.trim();
    let m;
    if (d.ext === 'py' && (m = t.match(/^from\s+([.\w]+)\s+import\s+(.+)$/))) {
      const dots = m[1].match(/^\.+/)?.[0].length || 0,
        rest = m[1].slice(dots).replace(/\./g, '/');
      let base = dirname(d.path);
      for (let j = 1; j < dots; j++) base = dirname(base);
      const rel = dots ? norm(base + '/' + rest) : rest;
      for (const member of m[2].replace(/[()]/g, '').split(',')) {
        const bits = member.trim().split(/\s+as\s+/);
        if (!/^\w+$/.test(bits[0])) continue;
        const file = findFile(index, [rel + '/' + bits[0], rel]);
        if (file && file.path !== d.path)
          d.imports.set(bits[1] || bits[0], { target: file, symbol: bits[0], line: i + 1 });
      }
    } else if (d.ext === 'py' && (m = t.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/))) {
      const file = findFile(index, [m[1].replace(/\./g, '/')]);
      if (file) d.imports.set(m[2] || m[1].split('.')[0], { target: file, line: i + 1 });
    } else if (
      /^[cm]?[jt]sx?$/.test(d.ext) &&
      (m = t.match(/^import\s+(.+?)\s+from\s*["']([^"']+)["']/)) &&
      m[2].startsWith('.')
    ) {
      const rel = norm(dirname(d.path) + '/' + m[2]),
        file = findFile(index, [rel, rel.replace(/\.(?:mjs|js|cjs)$/, '')]);
      if (!file) continue;
      for (const part of m[1].replace(/[{}]/g, '').split(',')) {
        const tokens = part
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/),
          binding = tokens.at(-1);
        if (/^[\w$]+$/.test(binding))
          d.imports.set(binding, { target: file, symbol: tokens[0], line: i + 1 });
      }
    } else if (
      /^[cm]?[jt]sx?$/.test(d.ext) &&
      (m = t.match(
        /^(?:const|var|let)\s+([\w$]+|\{[^}]+\})\s*=\s*require\(\s*["'](\.[^"']+)["']\s*\)/,
      ))
    ) {
      const file = findFile(index, [norm(dirname(d.path) + '/' + m[2])]);
      if (!file) continue;
      if (m[1].startsWith('{')) {
        for (const pair of m[1].slice(1, -1).split(',')) {
          const [name, alias] = pair.trim().split(/\s*:\s*/);
          if (/^[\w$]+$/.test(name))
            d.imports.set(alias || name, { target: file, symbol: name, line: i + 1 });
        }
      } else d.imports.set(m[1], { target: file, line: i + 1 });
    }
  }
}
function build(input = {}) {
  const rawFiles = Array.isArray(input.files) ? input.files : [],
    repoTitle = String(input.title || input.slug || 'Repositorio')
      .split('/')
      .pop();
  const docsRead = unique(
    rawFiles.slice(0, FILE_LIMIT).map(makeDoc).filter(Boolean),
    (d) => d.path,
  );
  const index = new Map(docsRead.map((d) => [d.path, d]));
  for (const d of docsRead) extract(d);
  for (const d of docsRead) imports(d, index);
  let origin = '';
  try {
    const u = new URL(input.url);
    if (
      u.protocol === 'https:' &&
      u.hostname === 'github.com' &&
      /^\/[\w.-]+\/[\w.-]+/.test(u.pathname) &&
      /^[0-9a-f]{7,64}$/i.test(String(input.revision))
    )
      origin =
        u.origin +
        '/' +
        u.pathname
          .split('/')
          .slice(1, 3)
          .join('/')
          .replace(/\.git$/, '') +
        '/blob/' +
        input.revision +
        '/';
  } catch {}
  function anchor(d, line, end = line, maxLines = 3) {
    if (!d || !Number.isInteger(line) || line < 1 || line > d.rows.length) return null;
    end = Math.min(Math.max(line, end), line + maxLines - 1, d.rows.length);
    if (d.rows[line - 1].length > MAX_LINE) return null;
    while (end > line && d.rows.slice(line - 1, end).join('').length > MAX_LINE) end--;
    const a = {
      path: d.path,
      line,
      end,
      excerpt: d.raw.slice(d.starts[line - 1], d.starts[end - 1] + d.rows[end - 1].length),
    };
    if (origin)
      a.url =
        origin +
        d.path.split('/').map(encodeURIComponent).join('/') +
        '#L' +
        line +
        (end > line ? '-L' + end : '');
    return a;
  }
  const pAnchor = (p) => anchor(p.d, p.line);
  const firstRef = (d) => {
    const i = d.rows.findIndex((t) => t.trim() && t.length <= MAX_LINE);
    return i >= 0 ? anchor(d, i + 1) : null;
  };
  const docTop = docsRead
    .filter((d) => /^readme(?:\.|$)/i.test(rootname(d.path)))
    .sort((a, b) => a.path.length - b.path.length)[0];
  let summarySource = null;
  function summary() {
    if (docTop) {
      let fence = false;
      const rows = docTop.rows.slice(0, 110);
      const prose = (t) => t && !/^(?:#|<|!|\[|\||-|\* |\d+\.|\.{2}|=|https?:)/.test(t);
      for (let i = 0; i < rows.length; i++) {
        const t = rows[i].trim();
        if (/^(?:`{3}|~{3})/.test(t)) {
          fence = !fence;
          continue;
        }
        if (fence || !prose(t)) continue;
        const start = i,
          paragraph = [t];
        while (i + 1 < rows.length && paragraph.length < 12 && prose(rows[i + 1].trim()))
          paragraph.push(rows[++i].trim());
        const desc = plain(paragraph.join(' ')).replace(/\[([^\]]+)\](?!\()/g, '$1');
        if (
          desc.length < 26 ||
          /^(?:table of contents|copyright|the following|npm install|pip install|license)/i.test(
            desc,
          )
        )
          continue;
        const sentences = desc.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¿¡])/);
        summarySource = anchor(docTop, start + 1, i + 1, 12);
        return limited(sentences.slice(0, 2).join(' ').trim(), 275);
      }
    }
    return (
      limited(plain(input.description || ''), 275) ||
      repoTitle + ' · selección local de código y documentación.'
    );
  }
  function callDetails(d, ln) {
    const txt = d.rows[ln - 1];
    if (!txt || txt.length > MAX_LINE) return [];
    const cleaned = txt
      .replace(/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, ' ')
      .split('//')[0]
      .split('#')[0];
    const out = [];
    for (const found of cleaned.matchAll(/\b([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?\s*\(/g)) {
      const [_, base, attr] = found;
      if (ignoreName.test(base)) continue;
      const im = d.imports.get(base);
      if (im) {
        const sought = attr || im.symbol || base;
        const target = im.target.defs.find((s) => s.name === sought);
        if (target) {
          out.push({
            label: attr ? base + '.' + attr : base,
            at: anchor(im.target, target.line),
            importAt: anchor(d, im.line),
            cross: true,
          });
          continue;
        }
      }
      if (!attr || /^(?:self|cls|this)$/.test(base)) {
        const name = attr || base,
          defs = d.defs.filter((s) => s.name === name && s.line !== ln);
        if (defs.length === 1)
          out.push({
            label: attr ? base + '.' + attr : base,
            at: anchor(d, defs[0].line),
            cross: false,
          });
      }
    }
    return unique(out, (r) => r.label);
  }
  function process(p) {
    const d = p.d,
      src = pAnchor(p);
    if (!src) return null;
    const steps = [];
    const add = (title, detail, status, sources) => {
      const refs = joinAnchors(sources);
      if (refs.length) steps.push({ title, detail, status, sources: refs });
    };
    let focus = p;
    let callbackLink = null;
    if (p.type === 'route' || p.type === 'command') {
      const later = d.defs.find((f) => f.line > p.line && f.line <= p.line + 12);
      if (p.handler) focus = d.defs.find((f) => f.line === p.handler) || p;
      else if (p.callback) {
        const [name, attr] = p.callback.split('.'),
          im = d.imports.get(name);
        const target = im ? im.target : d;
        const sought = attr || im?.symbol || name;
        const matches = target.defs.filter((s) => s.name === sought);
        if (matches.length === 1) {
          focus = matches[0];
          callbackLink = im ? anchor(d, im.line) : src;
        }
      } else if (
        d.ext === 'py' &&
        d.rows[p.line - 1].trimStart().startsWith('@') &&
        later &&
        !d.rows.slice(p.line, later.line - 1).some((x) => x.trim() && !/^\s*(?:@|#)/.test(x))
      )
        focus = later;
    }
    const titles = {
      route: 'Localizar el registro',
      api: 'Localizar la propiedad',
      command: 'Localizar el comando',
      schema: 'Leer el esquema',
      doc: 'Localizar la explicación',
      entry: 'Leer el punto de entrada',
      manifest: 'Examinar la configuración',
      boot: 'Localizar el inicio',
      class: 'Abrir la declaración',
      fn: 'Localizar la operación',
      text: 'Abrir el fragmento',
    };
    add(
      titles[p.type] || 'Abrir la fuente',
      p.type === 'entry'
        ? 'El manifiesto vincula ' + p.name + ' con ' + p.target + '.'
        : 'La referencia de partida está en ' + p.path + ' (línea ' + p.line + ').',
      K.source,
      [src],
    );
    if (p.type === 'entry' && p.target) {
      if (p.fileTarget) {
        const target = findFile(index, [norm(dirname(d.path) + '/' + p.target)]);
        if (target)
          add(
            'Abrir el archivo de entrada',
            'La ruta declarada coincide con el archivo ' + target.path + '.',
            K.source,
            [src, firstRef(target)],
          );
      } else {
        const [mod, meth] = p.target.split(':');
        const target = findFile(index, [mod.replace(/\./g, '/')]);
        const fn = target?.defs.find((s) => s.name === meth);
        if (fn) {
          focus = fn;
          add(
            'Localizar ' + meth,
            'El nombre de la entrada coincide con esta definición en ' + target.path + '.',
            K.inferred,
            [src, anchor(target, fn.line)],
          );
        }
      }
    } else if (focus !== p)
      add(
        'Inspeccionar ' + focus.name,
        callbackLink
          ? 'El nombre del manejador coincide con una definición en ' + focus.path + '.'
          : 'Esta declaración y la función se encuentran juntas en la fuente.',
        callbackLink ? K.inferred : K.source,
        [src, anchor(focus.d, focus.line), callbackLink],
      );
    const fd = focus.d,
      start = focus.line;
    let limit;
    if (['fn', 'class'].includes(focus.type)) limit = focus.end;
    else if (p.type === 'doc') {
      limit = Math.min(start + 12, fd.rows.length);
      for (let j = start; j < limit; j++)
        if (/^\s*#{1,4}\s/.test(fd.rows[j])) {
          limit = j;
          break;
        }
    } else if (p.inline) limit = spanEnd(d, p);
    else
      limit = Math.min(
        start + (['schema', 'manifest', 'boot'].includes(p.type) ? 6 : 0),
        fd.rows.length,
      );
    const cues = [];
    for (let j = start; j < Math.min(limit, start + 110); j++) {
      const l = fd.rows[j],
        t = l.trim();
      if (
        (impl.test(fd.path) && !fd.codeLines.has(j + 1)) ||
        !t ||
        t.length > MAX_LINE ||
        /^\s*(?:\/\/|\*|#|[{}\]);,]+$)/.test(l)
      )
        continue;
      const at = anchor(fd, j + 1);
      if (!at) continue;
      if (p.type === 'doc') {
        if (t.length < 12 || /^(```|<|===|---)/.test(t)) continue;
        cues.push({
          prio: 1,
          j,
          title: 'Leer el detalle documentado',
          detail: limited(plain(t), 165),
          status: K.source,
          sources: [at],
        });
        continue;
      }
      if (p.type === 'manifest' || p.type === 'schema') {
        if (/^\s*(?:\[|[\w"`'-]+\s*[:=]|[\w"`]+\s+[\w]+)/.test(t))
          cues.push({
            prio: 1,
            j,
            title:
              p.type === 'schema'
                ? 'Inspeccionar un campo o restricción'
                : 'Inspeccionar una opción',
            detail: limited(t, 125),
            status: K.source,
            sources: [at],
          });
        continue;
      }
      const call = callDetails(fd, j + 1)[0];
      const conditional =
        /^(?:}\s*)?(?:if\b|elif\b|else if\b|switch\b|match\b|case\b|except\b|catch\b|raise\b|throw\b)/.test(
          t,
        );
      if (call && !(j + 1 === focus.line))
        cues.push({
          prio: call.cross ? 8 : 6,
          j,
          title: 'Seguir ' + call.label,
          detail:
            'La llamada escrita aquí tiene una definición candidata en ' +
            call.at.path +
            '. Comprueba los argumentos y el destino efectivo.',
          status: K.inferred,
          sources: [at, call.at, call.importAt],
        });
      else if (conditional)
        cues.push({
          prio: 5,
          j,
          title: 'Examinar la condición',
          detail: 'La fuente contiene esta condición o tratamiento de error: ' + limited(t, 100),
          status: K.source,
          sources: [at],
        });
      else if (/^return(?:\b|\s*\()|^yield\b|^res\.(?:json|send|end)\(/.test(t))
        cues.push({
          prio: 7,
          j,
          title: 'Seguir la salida',
          detail: 'La expresión de salida visible es ' + limited(t, 120) + '.',
          status: K.source,
          sources: [at],
        });
      else if (/^\s*(?:(?:const|let|var)\s+)?[\w.[\]]+\s*(?::=|=(?!=))\s*[^=>]/.test(t))
        cues.push({
          prio: 3,
          j,
          title: 'Seguir un valor',
          detail: 'La asignación que se puede estudiar es ' + limited(t, 115) + '.',
          status: K.source,
          sources: [at],
        });
    }
    const highest = unique(
      cues.sort((a, b) => b.prio - a.prio || a.j - b.j),
      (x) => x.title,
    )
      .slice(0, 4 - steps.length)
      .sort((a, b) => a.j - b.j);
    for (const q of highest) add(q.title, q.detail, q.status, q.sources);
    if (steps.length === 1)
      add(
        'Determinar el alcance',
        'Esta referencia sitúa la operación. Hace falta otra fuente o una ejecución para justificar sus dependencias y efectos.',
        K.unknown,
        [src],
      );
    const declared = focus.docText ? focus.docText.replace(/\s+/g, ' ').trim() : null;
    return {
      id: id('proc', p.path + ':' + p.line + ':' + p.name),
      title: p.name,
      description: declared
        ? 'La documentación de ' + focus.name + ' comienza con «' + limited(declared, 180) + '».'
        : 'Inspección de ' +
          p.name +
          ' en ' +
          p.path +
          '. Los pasos siguen referencias de lectura y condiciones del texto.',
      status: K.inferred,
      sources: joinAnchors(
        src,
        declared ? anchor(focus.d, focus.docLine) : null,
        ...steps.map((s) => s.sources),
      ),
      steps,
    };
  }
  const labels = {
    setup: [
      'Configuración y arranque',
      'Los manifiestos y los puntos de entrada indican cómo se declara o inicia el programa.',
    ],
    interface: [
      'Interfaz y despacho de solicitudes',
      'Las rutas, los comandos y sus manejadores forman la superficie de entrada reconocible del proyecto.',
    ],
    storage: [
      'Persistencia y modelos de datos',
      'Las declaraciones y operaciones seleccionadas describen esquemas, archivos o acceso a datos.',
    ],
    compute: [
      'Transformación y cálculo',
      'Estas operaciones preparan, transforman o agregan valores usados por otras piezas.',
    ],
    transport: [
      'Integraciones y trabajo en segundo plano',
      'Las declaraciones seleccionadas apuntan a transporte, clientes o procesamiento diferido.',
    ],
    presentation: [
      'Presentación y salida',
      'Estas referencias construyen contenido, vistas, respuestas o informes.',
    ],
    checks: [
      'Pruebas y ejemplos',
      'Estos archivos muestran casos de uso o contratos que el proyecto intenta comprobar.',
    ],
    guide: [
      'Documentación del proyecto',
      'Estas secciones recogen las responsabilidades que documentan los autores.',
    ],
  };
  const hints = [
    [
      'storage',
      /\b(?:storage|store|database|schema|repositories|repository|persist|persistence|entity|migration|migrations|transaction|sqlite|postgres|orm|cache|sessions?)\b/,
    ],
    [
      'compute',
      /\b(?:compute|transform|normalize|aggregate|aggregation|predict|train|vector|tensor|pipeline|encode|decode|compile|parser|parse|tokenize|tokenizer|model|algorithm|calculate|sampling)\b/,
    ],
    [
      'transport',
      /\b(?:worker|workers|queue|enqueue|publish|subscribe|transport|client|socket|broker|tasks?|retry|fetch|connect|dispatch|events?)\b/,
    ],
    [
      'presentation',
      /\b(?:render|report|formatter|formatters|templates?|presentation|display|layout|views?|html|print|serialize|response|screens?|components?)\b/,
    ],
    [
      'interface',
      /\b(?:handlers?|routes?|router|controller|api|commands?|cli|request|endpoints?|server)\b/,
    ],
    ['setup', /\b(?:config|configuration|settings|options|bootstrap|initialize|setup)\b/],
  ];
  function classify(p) {
    if (p.d.aux) return 'checks';
    if (p.type === 'doc') return 'guide';
    if (['boot', 'entry', 'manifest'].includes(p.type)) return 'setup';
    if (['route', 'command', 'api'].includes(p.type)) return 'interface';
    if (p.type === 'schema') return 'storage';
    const stem = rootname(p.path).replace(/\.[^.]+$/, '');
    const folder = dirname(p.path).split('/').pop() || '';
    const symbols = friendly(p.name),
      fileWords = friendly(stem) + ' ' + friendly(folder);
    if (/\b(?:request|wsgi|asgi|routing|route|endpoint)\b/.test(symbols)) return 'interface';
    if (/\b(?:templates?|render|send file|send static file)\b/.test(symbols)) return 'presentation';
    if (/\b(?:register|blueprints?|configuration)\b/.test(symbols)) return 'setup';
    for (const str of [symbols, fileWords]) {
      const hit = hints.find(([, re]) => re.test(str));
      if (hit) return hit[0];
    }
    return 'core';
  }
  const translates = {
    create: 'Crear',
    list: 'Listar',
    add: 'Añadir',
    remove: 'Eliminar',
    delete: 'Eliminar',
    update: 'Actualizar',
    get: 'Consultar',
    load: 'Cargar',
    read: 'Leer',
    write: 'Escribir',
    save: 'Guardar',
    find: 'Buscar',
    search: 'Buscar',
    match: 'Comparar',
    validate: 'Validar',
    check: 'Comprobar',
    extract: 'Extraer',
    parse: 'Interpretar',
    render: 'Generar',
    format: 'Dar formato a',
    convert: 'Convertir',
    serialize: 'Serializar',
    send: 'Enviar',
    import: 'Importar',
    export: 'Exportar',
    handle: 'Procesar',
    build: 'Construir',
    calculate: 'Calcular',
    compute: 'Calcular',
    predict: 'Predecir',
    train: 'Entrenar',
    aggregate: 'Agregar',
    normalize: 'Normalizar',
    transform: 'Transformar',
    resolve: 'Resolver',
    collect: 'Recopilar',
    dispatch: 'Despachar',
    register: 'Registrar',
    open: 'Abrir',
    measure: 'Medir',
    record: 'Registrar',
    compile: 'Compilar',
    execute: 'Ejecutar',
    generate: 'Generar',
    process: 'Procesar',
    merge: 'Combinar',
    run: 'Ejecutar',
  };
  const fnPriority = (p) => {
    const w = words(p.name),
      isPrivate = p.name.startsWith('_');
    const isExport =
      /\b(?:export|public|pub|open)\b/.test(p.d.rows[p.line - 1]) ||
      (p.d.ext === 'go' && /^[A-Z]/.test(p.name));
    return (
      p.score +
      (translates[w[0]] ? 8 : 0) +
      (isExport ? 8 : 0) +
      (w.length > 1 ? 4 : 0) -
      (isPrivate ? 15 : 0) -
      (boring.test(p.name) ? 17 : 0) -
      (p.d.aux ? 28 : 0) -
      (/\.d\.[cm]?ts$/.test(p.path) ? 35 : 0)
    );
  };
  const all = [];
  for (const d of docsRead) {
    all.push(...d.points);
    for (const s of d.defs) all.push({ ...s, score: fnPriority(s) });
    if (!d.points.length && !d.defs.length) {
      const ref = firstRef(d);
      if (ref) all.push(point(d, 'text', rootname(d.path), ref.line, 8));
    }
  }
  const candidates = unique(
    all.filter((p) => p.name && pAnchor(p)).sort(rank),
    (p) => p.path + '|' + p.line + '|' + p.type + '|' + p.name,
  );
  function select(items, n) {
    const ordered = unique([...items].sort(rank), (p) => p.path + '|' + p.name + '|' + p.type);
    const first = unique(ordered, (p) => p.path);
    return unique([...first, ...ordered], (p) => p.path + '|' + p.line + '|' + p.name).slice(0, n);
  }
  const grouped = new Map();
  for (const p of candidates) {
    const key = classify(p);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p);
  }
  const archFields = [];
  for (const [key, items] of grouped) {
    const chosen = select(items, 4),
      coreSymbols = chosen.filter((p) => p.type === 'fn' || p.type === 'class').map((p) => p.name);
    const coreName = repoTitle.length > 45 ? limited(repoTitle, 45) : repoTitle;
    const label = labels[key] || [
      'Núcleo de ' + coreName,
      coreSymbols.length
        ? 'Implementaciones que conviene estudiar en conjunto, entre ellas ' +
          coreSymbols.slice(0, 3).join(', ') +
          '.'
        : 'Archivos legibles que sitúan la implementación de ' + coreName + '.',
    ];
    const score =
      items[0].score +
      (key === 'core' ? 5 : 0) +
      (key === 'guide' ? -20 : 0) +
      (key === 'checks' ? -35 : 0);
    archFields.push({
      key,
      items: chosen,
      title: label[0],
      description: label[1],
      score,
      allPaths: new Set(items.map((p) => p.path)),
    });
  }
  function unit(key, title, description, suggestions, reason, status = K.inferred) {
    const procs = suggestions.map(process).filter(Boolean);
    return {
      id: key,
      title,
      description,
      status,
      reason,
      sources: joinAnchors(suggestions.map(pAnchor)),
      processes: procs,
      related: [],
    };
  }
  const topArch = archFields.sort((a, b) => b.score - a.score).slice(0, GROUP_LIMIT);
  const architecture = topArch.map((g) =>
    unit(
      id('arch', g.key),
      g.title,
      g.description,
      g.items,
      g.key === 'guide'
        ? 'Las anclas llevan a las afirmaciones del documento. Su vigencia depende de la versión y del código.'
        : 'Agrupación sugerida a partir de registros, nombres y declaraciones presentes en los archivos leídos.',
    ),
  );
  function implTitle(p) {
    if (p.type === 'class') return 'Modelo «' + p.name + '»';
    const w = words(p.name);
    return translates[w[0]] && w.length > 1
      ? translates[w[0]] + ' «' + w.slice(1).join(' ') + '»'
      : 'Operación «' + p.name + '»';
  }
  // Capabilities collect concrete public operations by the domain words actually found
  // at a declaration. A single command family should not fill the whole index.
  const topics = [
    [
      'request',
      'Enrutamiento y ciclo de solicitudes',
      /\b(?:request|route|routing|routes|router|wsgi|asgi|endpoint|middleware)\b/,
      'Seguir desde la entrada de una solicitud hasta la selección de su manejador y su respuesta.',
    ],
    [
      'error',
      'Manejo de errores',
      /\b(?:exception|errors?|teardown|fallback)\b/,
      'Examinar qué condiciones activan el tratamiento de un error y qué devuelve el sistema.',
    ],
    [
      'session',
      'Sesiones y persistencia de estado',
      /\b(?:sessions?|cookies?)\b/,
      'Localizar las operaciones que consultan, guardan o recuperan el estado de una sesión.',
    ],
    [
      'template',
      'Preparación de vistas y plantillas',
      /\b(?:templates?|render|renderer|templating|jinja|views?)\b/,
      'Seguir cómo se preparan los datos que llegan a una vista o a una plantilla.',
    ],
    [
      'configuration',
      'Carga y aplicación de configuración',
      /\b(?:config|configuration|settings|envvar|environ|bootstrap)\b/,
      'Rastrear de dónde se carga una opción y en qué operación se consume.',
    ],
    [
      'registration',
      'Registro de componentes',
      /\b(?:blueprints?|plugins?|extension|registry|register)\b/,
      'Examinar cómo una pieza declara o registra comportamiento para utilizarlo más adelante.',
    ],
    [
      'parallel',
      'Control de concurrencia y tareas',
      /\b(?:concurrency|parallel|worker|executor|limit|limiter|throttle|enqueue|schedule|queue|scheduler|threads?)\b/,
      'Estudiar qué trabajo se admite, qué se difiere y cuándo puede continuar.',
    ],
    [
      'storage',
      'Acceso y cambios en los datos',
      /\b(?:store|storage|repository|repositories|database|query|transaction|cache|persist|migration|migrations)\b/,
      'Seguir una operación que lee, modifica o almacena información.',
    ],
    [
      'prediction',
      'Entrenamiento e inferencia',
      /\b(?:predict|prediction|infer|inference|train|trainer|model|models|tensor|embedding)\b/,
      'Examinar las entradas de una operación de modelo y la representación que produce.',
    ],
    [
      'pipeline',
      'Transformación y agregación de datos',
      /\b(?:pipeline|normalize|aggregate|aggregation|transform|vectorize|encode|decode|compute|calculate|parse|parser|tokenize)\b/,
      'Seguir los valores que atraviesan una transformación y comprobar su salida.',
    ],
    [
      'output',
      'Generación de informes y salidas',
      /\b(?:reports?|exports?|render|serialize|publish|formatters?|print)\b/,
      'Localizar cómo los datos se convierten en una salida utilizable.',
    ],
    [
      'communication',
      'Intercambio de mensajes',
      /\b(?:mail|messages?|socket|notify|notification|transport|protocol)\b/,
      'Estudiar cómo se prepara un mensaje y a qué operación se entrega.',
    ],
  ];
  const topicMap = new Map(topics.map((x) => [x[0], x]));
  function theme(p) {
    const nm = friendly(p.name);
    const exact = topics.filter((x) => x[2].test(nm));
    if (exact.length) {
      // When a request appears next to session, templates, errors or registration,
      // the more specific vocabulary names the responsibility.
      return (exact.find((x) => ['error', 'session', 'template', 'registration'].includes(x[0])) ||
        exact[0])[0];
    }
    const stem = rootname(p.path).replace(/\.[^.]+$/, '');
    if (/^(?:route|routes|request|index|app)$/i.test(stem)) return undefined;
    return topics.find((x) => x[2].test(friendly(stem)))?.[0];
  }
  const boost = (p, topic) => {
    const n = friendly(p.name);
    let score =
      p.score + (p.docLine ? 5 : 0) + (p.name === repoTitle || friendly(repoTitle) === n ? 18 : 0);
    if (topic && !topicMap.get(topic)[2].test(n)) score -= 18;
    if (/^(?:dispatch|handle|process|resolve|render|prepare|execute|evaluate|match|run)\b/.test(n))
      score += 10;
    if (/^(?:get|set|add|remove|list|is|has)\b/.test(n)) score -= 5;
    if (p.name.startsWith('_') || boring.test(p.name)) score -= 10;
    if (p.type === 'class') score += 4;
    if (/\b(?:test|debug|mock|wrapper|decorator|example|fixture|ctx)\b/.test(n)) score -= 15;
    if (
      topic === 'request' &&
      /^(?:(?:full )?dispatch request|(?:wsgi|asgi) app|handle request)$/.test(n)
    )
      score += 28;
    if (topic === 'session' && /^(?:open|save|load|read|write|create) session$/.test(n))
      score += 17;
    if (topic === 'template' && /^(?:render|stream) template$/.test(n)) score += 17;
    const row = p.d.rows[p.line - 1];
    if (/\bexport\s+default\b/.test(row)) score += 22;
    return score;
  };
  const featureBuckets = new Map();
  for (const p of candidates) {
    if (
      p.d.aux ||
      collateral.test(p.path) ||
      ['manifest', 'boot'].includes(p.type) ||
      (boring.test(p.name) && p.type === 'fn')
    )
      continue;
    let key,
      title,
      score = p.score,
      desc,
      proven = K.inferred,
      priority = score;
    if (p.type === 'route') {
      key = 'route|' + p.routePath;
      title = 'Solicitudes a ' + p.routePath;
      desc =
        'El código registra ' +
        p.name +
        '. La ruta efectiva puede incluir un prefijo de despliegue.';
      proven = K.source;
      priority = 103;
    } else if (['command', 'entry'].includes(p.type)) {
      key = 'command';
      title = 'Comandos y ejecución desde terminal';
      desc = 'Seguir los puntos de entrada declarados por nombre y abrir sus implementaciones.';
      proven = K.source;
      priority = 97;
    } else if (p.type === 'api') {
      key = 'api|' + p.name;
      title = 'Propiedad «' + p.property + '»';
      desc =
        'El código define la propiedad ' +
        p.name +
        '. Puedes localizar su definición y examinar su acceso o sus efectos.';
      proven = K.source;
      priority = 76;
    } else if (p.type === 'schema') {
      key = 'schema|' + p.name;
      title = 'Esquema «' + p.name + '»';
      desc =
        'El archivo declara ' +
        p.operation +
        ' ' +
        p.name +
        '. La versión aplicada requiere evidencia de ejecución.';
      proven = K.source;
      priority = 84;
    } else if (p.type === 'doc') {
      if (
        /^(?:api|args|fn|options|usage|recipes|faq|related|references|development(?: and support)?|download and get started|support|examples?|security issues|community|running tests|authors?|triagers|.* team members|concurrenc[y])$/i.test(
          p.name,
        )
      )
        continue;
      key = 'doc|' + p.name;
      title = p.name;
      desc =
        'La documentación desarrolla este tema. Comprueba su correspondencia con la implementación actual.';
      score += /^readme\b/i.test(rootname(p.path)) ? 6 : 0;
      score += /[\w$]+\.[\w$]+|\w+\([^)]*\)/.test(p.name) ? 7 : 0;
      proven = K.source;
      priority = score;
    } else if (p.type === 'text') {
      if (
        candidates.some(
          (q) => !q.d.aux && ['fn', 'class', 'entry', 'route', 'schema', 'api'].includes(q.type),
        )
      )
        continue;
      key = 'text|' + p.path;
      title = 'Examinar ' + p.name;
      desc = 'Este archivo permite empezar la lectura. Su función en la ejecución queda abierta.';
      priority = 4;
    } else {
      const topic = theme(p),
        info = topicMap.get(topic);
      score = boost(p, topic);
      if (info) {
        key = 'topic|' + topic;
        title = info[1];
        desc = info[3];
        priority = score;
      } else {
        key = 'impl|' + p.path + '|' + p.name;
        title = implTitle(p);
        desc =
          'La fuente declara ' +
          p.name +
          ' en ' +
          p.path +
          '. Su papel como capacidad del sistema requiere contrastar sus llamadas y efectos.';
        priority = score - 7;
      }
    }
    if (!featureBuckets.has(key))
      featureBuckets.set(key, {
        key,
        title,
        desc,
        score: priority,
        proven,
        type: p.type,
        items: [],
      });
    const bucket = featureBuckets.get(key);
    bucket.score = Math.max(bucket.score, priority);
    bucket.items.push({ ...p, score });
  }
  const ordered = [...featureBuckets.values()];
  for (const g of ordered) {
    if (g.key.startsWith('topic|')) g.score += Math.min(13, Math.log2(g.items.length + 1) * 3);
  }
  ordered.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const featureGroups = [],
    familyCount = new Map();
  for (const g of ordered) {
    const family = g.key.split('|')[0],
      count = familyCount.get(family) || 0;
    if (
      (family === 'route' && count >= 3) ||
      (family === 'impl' && count >= 2) ||
      (family === 'doc' && count >= 2)
    )
      continue;
    familyCount.set(family, count + 1);
    featureGroups.push(g);
    if (featureGroups.length >= GROUP_LIMIT) break;
  }
  if (featureGroups.length < GROUP_LIMIT)
    for (const g of ordered) {
      if (!featureGroups.includes(g) && !['doc', 'text'].includes(g.type)) featureGroups.push(g);
      if (featureGroups.length >= GROUP_LIMIT) break;
    }
  const features = featureGroups.map((g) => {
    const ranked = unique([...g.items].sort(rank), (p) => p.name);
    const seeds = ranked.slice(0, 4);
    if (g.type === 'route' && g.items.length > 1)
      g.desc =
        'Los registros de esta ruta incluyen ' +
        unique(g.items, (p) => p.name)
          .map((p) => p.name)
          .slice(0, 4)
          .join(', ') +
        '. El prefijo efectivo depende del montaje.';
    if (g.key === 'command')
      g.desc +=
        ' Entradas visibles: ' +
        ranked
          .map((p) => p.name)
          .slice(0, 4)
          .join(', ') +
        '.';
    return unit(
      id('feature', g.key),
      g.title,
      g.desc,
      seeds,
      g.proven === K.source
        ? 'La declaración o el texto citado se puede localizar directamente en la revisión leída.'
        : 'Agrupación sugerida por el vocabulario de las declaraciones. Cada proceso enlaza su implementación para comprobar sus condiciones y efectos.',
      g.proven,
    );
  });
  for (const [i, g] of topArch.entries()) {
    const linked = new Map();
    for (const p of g.items) {
      for (const { target, line } of p.d.imports.values()) {
        const representative =
          target.points.find((x) => ['route', 'entry', 'schema'].includes(x.type)) ||
          target.defs.find((x) => !boring.test(x.name)) ||
          target.points[0];
        const j = representative
          ? topArch.findIndex((other) => other.key === classify(representative))
          : -1;
        if (j >= 0 && j !== i && !linked.has(j))
          linked.set(j, {
            id: architecture[j].id,
            title: architecture[j].title,
            reason: 'Importación local de ' + p.path + ' a ' + target.path + '.',
            sources: joinAnchors(anchor(p.d, line), firstRef(target)),
          });
      }
    }
    architecture[i].related = [...linked.values()].slice(0, 3);
  }
  for (const [i, g] of featureGroups.entries()) {
    const hints = unique(g.items.map(classify), (s) => s);
    features[i].related = topArch
      .map((other, j) =>
        hints.includes(other.key)
          ? {
              id: architecture[j].id,
              title: architecture[j].title,
              reason: 'La agrupación comparte una declaración con esta funcionalidad.',
            }
          : null,
      )
      .filter(Boolean)
      .slice(0, 3);
  }
  const treeCount = Array.isArray(input.tree) ? input.tree.length : docsRead.length;
  const inherited = input.coverage && typeof input.coverage === 'object' ? input.coverage : {};
  return {
    summary: summary(),
    summarySource,
    architecture,
    features,
    coverage: {
      ...inherited,
      treeTotal: treeCount,
      readFiles: docsRead.length,
      parsedFiles: docsRead.filter((d) => d.defs.length || d.points.length).length,
      definitions: docsRead.reduce((n, d) => n + d.defs.length, 0),
      boundImports: docsRead.reduce((n, d) => n + d.imports.size, 0),
      analyzedLines: docsRead.reduce((n, d) => n + d.rows.length, 0),
      unreadFiles: Math.max(0, treeCount - docsRead.length),
      limitations: [
        ...(Array.isArray(inherited.limitations) ? inherited.limitations : []),
        'Análisis estático y acotado de los archivos recibidos.',
        'El orden de lectura y las llamadas candidatas no prueban el orden real de ejecución.',
        'Los registros dinámicos, servicios externos y configuraciones de despliegue necesitan más evidencia.',
      ],
    },
  };
}
export { build };
