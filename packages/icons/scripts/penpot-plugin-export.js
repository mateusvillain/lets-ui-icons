/*
  Exporta os ícones do arquivo aberto no Penpot para o pull-icons-penpot.js.

  Roda dentro do Penpot, pelo execute_code do Penpot MCP (`penpot` e `storage`
  são globais do plugin — isto não é um módulo Node). O plugin não consegue
  chamar http://localhost, então os ícones saem pela resposta do MCP:

    1. Executar este arquivo inteiro: define as funções e monta a fila.
    2. Repetir até `done: true` (cada execução tem limite de 120s):
         return await storage.penpotExport.exportBatch();
    3. Pegar o manifest e os ícones em partes:
         return storage.penpotExport.manifest();
         return storage.penpotExport.chunk(0);   // 1, 2, ... até chunks - 1
       Gravar em packages/icons/.penpot-export/manifest.json e NN.json.
    4. pnpm --filter @lets-ui/icons pull:penpot

  Cada ícone é uma variante de componente com propriedade `style` =
  outline | solid. A categoria vem do nome ("categoria/nome") ou do
  path do componente (name "nome", path "categoria").
*/

const BATCH_SIZE = 15;
const CHUNK_SIZE = 25;

// FNV-1a 32 bits — o pull-icons-penpot.js confere cada SVG com este hash
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function decode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return decodeURIComponent(escape(binary));
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

const variants = new Map();
for (const component of penpot.library.local.components) {
  const list = component.isVariant()
    ? component.variants.variantComponents()
    : [component];
  for (const v of list) variants.set(v.id, v);
}

const state = {
  queue: [...variants.values()],
  icons: [],
  errors: [],
};

storage.penpotExport = {
  async exportBatch() {
    for (const v of state.queue.splice(0, BATCH_SIZE)) {
      const name = v.path ? `${v.path}/${v.name}` : v.name;
      const label = `${name} (${v.variantProps?.style})`;
      if (!['outline', 'solid'].includes(v.variantProps?.style)) {
        state.errors.push(`${label}: variante sem style outline/solid`);
        continue;
      }
      try {
        const raw = decode(await v.mainInstance().export({ type: 'svg' }));
        const svg = cleanPenpotSvg(raw);
        state.icons.push({ name, style: v.variantProps?.style, svg, hash: hash(svg) });
      } catch (err) {
        state.errors.push(`${label}: ${err.message}`);
      }
    }
    return {
      exported: state.icons.length,
      remaining: state.queue.length,
      errors: state.errors,
      done: state.queue.length === 0,
    };
  },

  manifest() {
    return {
      file: { id: penpot.currentFile.id, name: penpot.currentFile.name },
      exportedAt: new Date().toISOString(),
      total: state.icons.length,
      chunks: Math.ceil(state.icons.length / CHUNK_SIZE),
      hashes: Object.fromEntries(
        state.icons.map((i) => [`${i.name}#${i.style}`, i.hash])
      ),
    };
  },

  chunk(index) {
    return state.icons.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
  },
};

return { queued: state.queue.length };
