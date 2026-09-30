import fs from 'fs-extra';
import { optimize } from 'svgo';
import svgoConfig from '../svgo.config.js';

/*
  Gera dist/ + categories.json a partir dos ícones exportados do Penpot,
  no mesmo formato do pull-icons.js (Figma).

  O Penpot não permite exportar SVG com access token, então a exportação
  roda dentro do Penpot pelo Penpot MCP (scripts/penpot-plugin-export.js)
  e o resultado é gravado em .penpot-export/:
    manifest.json   total de ícones e hash de cada SVG
    00.json, 01.json, ...   [{ name, style, svg, hash }]

  Como os SVGs passam pela conversa com o agente, cada um é conferido
  com o hash calculado no Penpot antes de qualquer arquivo ser gravado.
*/

/* =========================
   PATHS
========================= */

const EXPORT_DIR = '.penpot-export';
const OUT_DIR = 'dist';
const CATEGORIES_FILE = 'categories.json';
const STYLES = ['outline', 'solid'];

/* =========================
   HELPERS
========================= */

// Mesmo hash do penpot-plugin-export.js (FNV-1a 32 bits)
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// "arrows/arrow-down" → { category: "arrows", name: "arrow-down" }
// "arrow-down"        → { category: "misc",   name: "arrow-down" }
function parseName(raw) {
  const parts = raw.split('/');
  const name = parts[parts.length - 1];
  const category = parts.length > 1 ? parts[0] : 'misc';
  return { name, category };
}

/* =========================
   LEITURA + VALIDAÇÃO
========================= */

async function readExport() {
  const manifestPath = `${EXPORT_DIR}/manifest.json`;
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`${manifestPath} não encontrado`);
  }
  const manifest = await fs.readJson(manifestPath);

  const chunkFiles = (await fs.readdir(EXPORT_DIR))
    .filter((f) => /^\d+\.json$/.test(f))
    .sort();
  if (chunkFiles.length !== manifest.chunks) {
    throw new Error(
      `esperava ${manifest.chunks} partes, encontrei ${chunkFiles.length}`
    );
  }

  const icons = [];
  for (const file of chunkFiles) {
    icons.push(...(await fs.readJson(`${EXPORT_DIR}/${file}`)));
  }

  const errors = [];
  const seen = new Set();

  for (const icon of icons) {
    const key = `${icon.name}#${icon.style}`;
    if (seen.has(key)) errors.push(`${key}: duplicado`);
    seen.add(key);

    if (!STYLES.includes(icon.style)) {
      errors.push(`${key}: style inválido`);
    }
    if (hash(icon.svg) !== manifest.hashes[key]) {
      errors.push(`${key}: hash não confere`);
    }
  }

  for (const key of Object.keys(manifest.hashes)) {
    if (!seen.has(key)) errors.push(`${key}: faltando`);
  }

  if (icons.length !== manifest.total) {
    errors.push(`esperava ${manifest.total} ícones, encontrei ${icons.length}`);
  }

  if (errors.length) {
    throw new Error(`export inválido:\n  ${errors.join('\n  ')}`);
  }

  return { manifest, icons };
}

/* =========================
   MAIN
========================= */

async function run() {
  const { manifest, icons } = await readExport();
  console.log(
    `\n📦 ${icons.length} ícones de "${manifest.file.name}" (${manifest.exportedAt})`
  );

  const categories = {};

  // Export completo: limpa o dist para não sobrar ícone renomeado/removido
  await fs.emptyDir(OUT_DIR);

  for (const icon of icons) {
    const { name, category } = parseName(icon.name);
    const fileName =
      icon.style === 'outline' ? `${name}.svg` : `${name}-${icon.style}.svg`;

    const optimized = optimize(icon.svg, svgoConfig).data;
    await fs.writeFile(`${OUT_DIR}/${fileName}`, optimized);

    if (!categories[category]) categories[category] = new Set();
    categories[category].add(name);
  }

  /* ── Generate categories.json ── */

  const output = Object.fromEntries(
    Object.entries(categories)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, names]) => [cat, [...names].sort()])
  );

  await fs.writeFile(CATEGORIES_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(
    `✅ ${icons.length} SVGs em ${OUT_DIR}/ | ${Object.keys(output).length} categorias em ${CATEGORIES_FILE}`
  );
}

run().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
