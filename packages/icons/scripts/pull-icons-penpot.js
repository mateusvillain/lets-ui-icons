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

// Quantos números cada comando de path recebe
const PATH_PARAMS = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7 };

// Desloca um path por (dx, dy). Só os comandos absolutos (maiúsculos)
// mudam; nos arcos, só o ponto final (os dois últimos números). O split
// é só pelas letras de comando: o "e" de 1.5e-7 fica com o número.
function translatePath(d, dx, dy) {
  return d.replace(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi, (_, cmd, args) => {
    const size = PATH_PARAMS[cmd];
    if (!size) return cmd + args;

    const nums = args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
    const moved = nums.map((n, i) => {
      const k = i % size;
      let shift = 0;
      if (cmd === 'H') shift = dx;
      else if (cmd === 'V') shift = dy;
      else if (cmd === 'A') shift = k === 5 ? dx : k === 6 ? dy : 0;
      else shift = k % 2 ? dy : dx;
      return Number(n) + shift;
    });
    return cmd + moved.join(',');
  });
}

// O SVG do penpot.generateMarkup é o render do workspace: clipPath, fundo do
// board, coordenadas da página (o viewBox não começa em 0 0) e cada forma
// repetida (uma cópia dentro do board, outra depois dele, e mais uma em
// .stroke-shape quando há stroke). Aqui sobram só as formas visíveis, sem
// cor e em 0 0, como no export do Figma.
function cleanPenpotSvg(raw) {
  const viewBox = raw
    .match(/<svg\b[^>]*\sviewBox="([^"]+)"/)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length !== 4) throw new Error('SVG sem viewBox');

  const [x, y, width, height] = viewBox;
  const d = (value) => roundNumbers(translatePath(value, -x, -y));
  const num = (value, shift) => roundNumbers(String(Number(value) + shift));

  const elements = new Set();

  for (const [, tag, attrSource] of raw.matchAll(
    /<(path|ellipse)\b([^>]*?)\/?>/g
  )) {
    const attrs = parseAttrs(attrSource);
    const style = parseStyle(attrs.style);

    if (style.stroke && style.stroke !== 'none') {
      if (tag !== 'path') throw new Error(`stroke em <${tag}> não suportado`);
      elements.add(
        `<path d="${d(attrs.d)}" stroke-width="${parseFloat(style['stroke-width'])}"` +
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
      const cx = num(attrs.cx, -x);
      const cy = num(attrs.cy, -y);
      const [rx, ry] = [attrs.rx, attrs.ry].map(roundNumbers);
      elements.add(
        rx === ry
          ? `<circle cx="${cx}" cy="${cy}" r="${rx}"/>`
          : `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`
      );
      continue;
    }

    const fillRule =
      attrs['fill-rule'] === 'evenodd' ? ' fill-rule="evenodd"' : '';
    elements.add(`<path d="${d(attrs.d)}"${fillRule}/>`);
  }

  if (!elements.size) throw new Error('nenhuma forma visível encontrada');

  return `<svg viewBox="0 0 ${roundNumbers(`${width} ${height}`)}">${[...elements].join('')}</svg>`;
}

/* =========================
   LEITURA + VALIDAÇÃO
========================= */

async function findExport() {
  const arg = process.argv[2];
  if (arg) return path.resolve(process.env.INIT_CWD || '.', arg);

  const downloads = await fs.readdir(DOWNLOADS_DIR).catch((err) => {
    if (err.code !== 'EPERM') throw err;
    throw new Error(
      `sem permissão para ler ${DOWNLOADS_DIR} (macOS) — informe o caminho do lets-ui-icons-penpot.json`
    );
  });
  const candidates = downloads
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

    if (!STYLES.includes(icon.style)) {
      errors.push(`${key}: style inválido`);
      continue;
    }

    // Pelo nome do arquivo: "a/arrow" e "b/arrow" também colidem
    const name = parseName(icon.name);
    const fileName =
      icon.style === 'outline' ? `${name}.svg` : `${name}-${icon.style}.svg`;
    if (seen.has(fileName)) errors.push(`${key}: ${fileName} duplicado`);
    seen.add(fileName);

    try {
      files.push({
        fileName,
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
