import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { optimize } from 'svgo';
import svgoConfig from '../svgo.config.js';

/*
  Gera dist/ a partir dos ícones exportados do Penpot,
  no mesmo formato do pull-icons.js (Figma).

  O Penpot não permite exportar SVG com access token, então a exportação
  roda dentro do Penpot pelo plugin em packages/penpot-plugin, que baixa
  um único lets-ui-icons-penpot.json:
    { file, exportedAt, total, icons: [{ name, style, svg }] }

  Uso:
    pnpm pull:penpot                 usa o export mais recente em ~/Downloads
    pnpm pull:penpot caminho.json    usa o arquivo informado
*/

/* =========================
   PATHS
========================= */

const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');
// O navegador pode baixar como "lets-ui-icons-penpot (1).json"
const EXPORT_FILE = /^lets-ui-icons-penpot( ?\(\d+\))?\.json$/;
const OUT_DIR = 'dist';
const STYLES = ['outline', 'solid'];

/* =========================
   HELPERS
========================= */

// Ignora pastas no nome: "arrows/arrow-down" → "arrow-down"
function parseName(raw) {
  return raw.split('/').pop();
}

function parseAttrs(source) {
  const attrs = {};
  for (const [, key, value] of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attrs[key] = value;
  }
  return attrs;
}

function parseStyle(style = '') {
  const props = {};
  for (const decl of style.split(';')) {
    const [key, ...value] = decl.split(':');
    if (key.trim()) props[key.trim()] = value.join(':').trim();
  }
  return props;
}

// 11.999984741210938 → 12
function roundNumbers(value) {
  return value.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) =>
    String(+Number(n).toFixed(4))
  );
}

// O SVG exportado pelo Penpot é o render do workspace: clipPath, fundo do
// board e cada forma duplicada (uma cópia em .fills, outra em .stroke-shape).
// Aqui sobram só as formas visíveis, sem cor, como no export do Figma.
function cleanPenpotSvg(raw) {
  const viewBox = raw.match(/<svg\b[^>]*\sviewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error('SVG sem viewBox');

  const elements = [];

  for (const [, tag, attrSource] of raw.matchAll(
    /<(path|ellipse)\b([^>]*?)\/?>/g
  )) {
    const attrs = parseAttrs(attrSource);
    const style = parseStyle(attrs.style);

    if (style.stroke && style.stroke !== 'none') {
      if (tag !== 'path') throw new Error(`stroke em <${tag}> não suportado`);
      elements.push(
        `<path d="${roundNumbers(attrs.d)}" stroke-width="${parseFloat(style['stroke-width'])}"` +
          ` stroke-linecap="${style['stroke-linecap'] || 'round'}"` +
          ` stroke-linejoin="${style['stroke-linejoin'] || 'round'}"/>`
      );
      continue;
    }

    // Sem fill no style = cópia de uma forma que só tem stroke
    const hasFill =
      style.fill &&
      style.fill !== 'none' &&
      Number(style['fill-opacity'] ?? 1) > 0;
    if (!hasFill) continue;

    if (tag === 'ellipse') {
      const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((k) =>
        roundNumbers(attrs[k])
      );
      elements.push(
        rx === ry
          ? `<circle cx="${cx}" cy="${cy}" r="${rx}"/>`
          : `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`
      );
      continue;
    }

    const fillRule =
      attrs['fill-rule'] === 'evenodd' ? ' fill-rule="evenodd"' : '';
    elements.push(`<path d="${roundNumbers(attrs.d)}"${fillRule}/>`);
  }

  if (!elements.length) throw new Error('nenhuma forma visível encontrada');

  return `<svg viewBox="${roundNumbers(viewBox)}">${elements.join('')}</svg>`;
}

/* =========================
   LEITURA + VALIDAÇÃO
========================= */

async function findExport() {
  const arg = process.argv[2];
  if (arg) return path.resolve(process.env.INIT_CWD || '.', arg);

  const candidates = (await fs.readdir(DOWNLOADS_DIR))
    .filter((f) => EXPORT_FILE.test(f))
    .map((f) => path.join(DOWNLOADS_DIR, f));
  if (!candidates.length) {
    throw new Error(
      `nenhum lets-ui-icons-penpot.json em ${DOWNLOADS_DIR} — exporte pelo plugin ou informe o caminho`
    );
  }

  const stats = await Promise.all(candidates.map((f) => fs.stat(f)));
  return candidates[
    stats.reduce(
      (newest, s, i) => (s.mtimeMs > stats[newest].mtimeMs ? i : newest),
      0
    )
  ];
}

async function readExport(file) {
  const data = await fs.readJson(file);
  const icons = data.icons ?? [];
  const errors = [];
  const seen = new Set();
  const files = [];

  for (const icon of icons) {
    const key = `${icon.name}#${icon.style}`;
    if (seen.has(key)) errors.push(`${key}: duplicado`);
    seen.add(key);

    if (!STYLES.includes(icon.style)) {
      errors.push(`${key}: style inválido`);
      continue;
    }

    try {
      const name = parseName(icon.name);
      files.push({
        fileName:
          icon.style === 'outline'
            ? `${name}.svg`
            : `${name}-${icon.style}.svg`,
        svg: optimize(cleanPenpotSvg(icon.svg), svgoConfig).data,
      });
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
  }

  if (!icons.length) errors.push('nenhum ícone no export');
  if (icons.length !== data.total) {
    errors.push(`esperava ${data.total} ícones, encontrei ${icons.length}`);
  }

  if (errors.length) {
    throw new Error(`export inválido:\n  ${errors.join('\n  ')}`);
  }

  return { data, files };
}

/* =========================
   MAIN
========================= */

async function run() {
  const file = await findExport();
  const { data, files } = await readExport(file);
  console.log(
    `\n📦 ${files.length} ícones de "${data.file.name}" (${data.exportedAt})` +
      `\n   ${file}`
  );

  // Export completo: limpa o dist para não sobrar ícone renomeado/removido
  await fs.emptyDir(OUT_DIR);

  for (const { fileName, svg } of files) {
    await fs.writeFile(`${OUT_DIR}/${fileName}`, svg);
  }

  console.log(`✅ ${files.length} SVGs em ${OUT_DIR}/`);
}

run().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
