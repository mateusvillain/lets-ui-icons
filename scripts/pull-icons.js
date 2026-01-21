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

const RAW_DIR = 'icons/raw';
const OUT_DIR = 'icons/optimized';

const headers = {
  'X-Figma-Token': TOKEN,
};

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

/**
 * Exporta SVGs EM LOTE (batch)
 */
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

function getStyleFromName(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('solid')) return 'solid';
  if (lower.includes('outline')) return 'outline';
  return 'outline';
}

/* =========================
   MAIN
========================= */

async function run() {
  await fs.ensureDir(RAW_DIR);
  await fs.ensureDir(OUT_DIR);

  const file = await getFile();
  const componentSets = file.componentSets || {};

  const sets = Object.entries(componentSets).filter(([, set]) =>
    set.name.startsWith('lui/')
  );

  if (!sets.length) {
    console.warn('⚠️ Nenhum Component Set encontrado com prefixo "lui/"');
    return;
  }

  for (const [setNodeId, set] of sets) {
    const baseName = set.name.replace('lui/', '');
    const setNode = await getNode(setNodeId);
    if (!setNode) continue;

    const children = (setNode.children || []).filter((c) => c?.id);
    if (!children.length) continue;

    // 👉 EXPORTAÇÃO EM LOTE (AQUI ESTÁ A MÁGICA)
    const ids = children.map((c) => c.id);
    const imagesMap = await exportSVGBatch(ids);

    for (const child of children) {
      const url = imagesMap[child.id];
      if (!url) continue;

      const style = getStyleFromName(child.name);
      const fileName =
        style === 'outline' ? `${baseName}.svg` : `${baseName}-${style}.svg`;

      const svg = await fetch(url).then((r) => r.text());

      await fs.writeFile(`${RAW_DIR}/${fileName}`, svg);

      const optimized = optimize(svg, svgoConfig).data;
      await fs.writeFile(`${OUT_DIR}/${fileName}`, optimized);

      console.log(`✔ ${baseName} (${style})`);
    }
  }

  console.log('✅ Ícones exportados com sucesso (batch)');
}

run().catch((err) => {
  console.error('❌ Erro ao executar script');
  console.error(err);
});
