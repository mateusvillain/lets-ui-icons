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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exportSVGBatch(nodeIds = [], chunkSize = 25) {
  if (!nodeIds.length) return {};
  const results = {};
  for (let i = 0; i < nodeIds.length; i += chunkSize) {
    const chunk = nodeIds.slice(i, i + chunkSize);
    const ids = chunk.join(',');

    let delay = 3000;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        console.log(
          `  ⏳ Rate limit — aguardando ${delay / 1000}s antes de tentar novamente...`
        );
        await sleep(delay);
        delay *= 2;
      }
      const res = await fetch(
        `https://api.figma.com/v1/images/${FILE_ID}?ids=${ids}&format=svg`,
        { headers }
      );
      const data = await res.json();
      if (data.err) {
        console.warn(`⚠️ Figma API error: ${data.err}`);
        if (attempt < 3) continue;
      } else {
        Object.assign(results, data.images || {});
      }
      break;
    }

    if (i + chunkSize < nodeIds.length) await sleep(1000);
  }
  return results;
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

  // Split components into variants (have componentSetId) and standalone (don't)
  const variantsBySet = {};
  const standaloneComponents = [];

  for (const [id, comp] of Object.entries(allComponents)) {
    if (comp.componentSetId) {
      if (!variantsBySet[comp.componentSetId])
        variantsBySet[comp.componentSetId] = [];
      variantsBySet[comp.componentSetId].push({ id, name: comp.name });
    } else {
      standaloneComponents.push([id, comp]);
    }
  }

  const totalVariants = Object.values(variantsBySet).reduce(
    (s, v) => s + v.length,
    0
  );
  console.log(
    `\n📦 ${totalVariants} variantes em ${Object.keys(variantsBySet).length} sets | ${standaloneComponents.length} standalone`
  );

  // Export all IDs in a single batch pass to minimise API calls
  const allIds = Object.keys(allComponents);
  console.log(`⟳ Exportando ${allIds.length} componentes...\n`);
  const allImagesMap = await exportSVGBatch(allIds);

  /* ── Component Sets (variants: outline / solid) ── */

  for (const [setId, variants] of Object.entries(variantsBySet)) {
    const set = componentSets[setId];
    if (!set) continue;

    const { name: baseName, category } = parseName(set.name);

    for (const variant of variants) {
      const url = allImagesMap[variant.id];
      if (!url) continue;

      const style = getStyleFromName(variant.name);
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

  for (const [id, comp] of standaloneComponents) {
    const url = allImagesMap[id];
    if (!url) continue;

    const { name: baseName, category } = parseName(comp.name);
    const svg = await fetch(url).then((r) => r.text());
    const optimized = optimize(svg, svgoConfig).data;

    await fs.writeFile(`${OUT_DIR}/${baseName}.svg`, optimized);
    console.log(`✔ ${baseName} (standalone)`);

    if (!categories[category]) categories[category] = new Set();
    categories[category].add(baseName);
  }

  /* ── Generate categories.json ── */

  const output = Object.fromEntries(
    Object.entries(categories)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, names]) => [cat, [...names].sort()])
  );

  await fs.writeFile(CATEGORIES_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log('\n✅ Ícones exportados com sucesso');
}

run().catch((err) => {
  console.error('❌ Erro ao executar script');
  console.error(err);
});
