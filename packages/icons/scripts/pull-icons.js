import fetch from 'node-fetch';
import fs from 'fs-extra';
import { optimize } from 'svgo';
import svgoConfig from '../svgo.config.js';
import 'dotenv/config';

/* =========================
   ENV
========================= */

const FILE_ID = process.env.FIGMA_FILE_ID;
const TOKEN = process.env.FIGMA_TOKEN;

if (!FILE_ID || !TOKEN) {
  console.error('❌ FIGMA_FILE_ID ou FIGMA_TOKEN não definidos');
  process.exit(1);
}

/* =========================
   PATHS
========================= */

const OUT_DIR = 'dist';
const CATEGORIES_FILE = 'categories.json';

const headers = { 'X-Figma-Token': TOKEN };

/* =========================
   API
========================= */

async function getFile() {
  const res = await fetch(`https://api.figma.com/v1/files/${FILE_ID}`, {
    headers,
  });
  return res.json();
}

async function getNode(nodeId) {
  const res = await fetch(
    `https://api.figma.com/v1/files/${FILE_ID}/nodes?ids=${encodeURIComponent(
      nodeId
    )}`,
    { headers }
  );
  const data = await res.json();
  const entry = Object.values(data.nodes || {})[0];
  return entry?.document || null;
}

async function exportSVGBatch(nodeIds = []) {
  if (!nodeIds.length) return {};
  const ids = nodeIds.join(',');
  const res = await fetch(
    `https://api.figma.com/v1/images/${FILE_ID}?ids=${ids}&format=svg`,
    { headers }
  );
  const data = await res.json();
  return data.images || {};
}

/* =========================
   HELPERS
========================= */

// "arrows/arrow-down" → { category: "arrows", name: "arrow-down" }
// "arrow-down"        → { category: "misc",   name: "arrow-down" }
function parseName(raw) {
  const parts = raw.split('/');
  const name = parts[parts.length - 1];
  const category = parts.length > 1 ? parts[0] : 'misc';
  return { name, category };
}

function getStyleFromName(name = '') {
  return name.toLowerCase().includes('solid') ? 'solid' : 'outline';
}

/* =========================
   MAIN
========================= */

async function run() {
  await fs.ensureDir(OUT_DIR);

  const file = await getFile();
  const componentSets = file.componentSets || {};
  const allComponents = file.components || {};

  const categories = {};
  const variantComponentIds = new Set();

  /* ── Component Sets (variants: outline / solid) ── */

  for (const [setNodeId, set] of Object.entries(componentSets)) {
    const { name: baseName, category } = parseName(set.name);
    const setNode = await getNode(setNodeId);
    if (!setNode) continue;

    const children = (setNode.children || []).filter((c) => c?.id);
    if (!children.length) continue;

    children.forEach((c) => variantComponentIds.add(c.id));

    const imagesMap = await exportSVGBatch(children.map((c) => c.id));

    for (const child of children) {
      const url = imagesMap[child.id];
      if (!url) continue;

      const style = getStyleFromName(child.name);
      const fileName =
        style === 'outline' ? `${baseName}.svg` : `${baseName}-${style}.svg`;

      const svg = await fetch(url).then((r) => r.text());
      const optimized = optimize(svg, svgoConfig).data;

      await fs.writeFile(`${OUT_DIR}/${fileName}`, optimized);
      console.log(`✔ ${baseName} (${style})`);
    }

    if (!categories[category]) categories[category] = new Set();
    categories[category].add(baseName);
  }

  /* ── Standalone components (no variants) ── */

  const standaloneComponents = Object.entries(allComponents).filter(
    ([id]) => !variantComponentIds.has(id)
  );

  if (standaloneComponents.length) {
    const imagesMap = await exportSVGBatch(
      standaloneComponents.map(([id]) => id)
    );

    for (const [id, comp] of standaloneComponents) {
      const url = imagesMap[id];
      if (!url) continue;

      const { name: baseName, category } = parseName(comp.name);
      const svg = await fetch(url).then((r) => r.text());
      const optimized = optimize(svg, svgoConfig).data;

      await fs.writeFile(`${OUT_DIR}/${baseName}.svg`, optimized);
      console.log(`✔ ${baseName} (standalone)`);

      if (!categories[category]) categories[category] = new Set();
      categories[category].add(baseName);
    }
  }

  /* ── Generate categories.json ── */

  const output = Object.fromEntries(
    Object.entries(categories)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, names]) => [cat, [...names].sort()])
  );

  await fs.writeFile(CATEGORIES_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log('✅ Ícones exportados com sucesso');
}

run().catch((err) => {
  console.error('❌ Erro ao executar script');
  console.error(err);
});
