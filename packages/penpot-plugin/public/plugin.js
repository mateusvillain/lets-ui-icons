/* global penpot */

/*
  Exporta os ícones do arquivo aberto no Penpot para o pull:penpot.

  Cada ícone é uma variante de componente com propriedade `style` =
  outline | solid. O SVG sai como o Penpot renderiza; a limpeza fica no
  pull-icons-penpot.js. O resultado vai para a UI (ui.html), que baixa
  tudo num único lets-ui-icons-penpot.json.
*/

const CONCURRENCY = 6;
const STYLES = ['outline', 'solid'];

penpot.ui.open("Let's UI Icons · Export", 'ui.html', {
  width: 300,
  height: 360,
});

function decode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return decodeURIComponent(escape(binary));
}

function collectVariants() {
  const variants = new Map();
  for (const component of penpot.library.local.components) {
    const list = component.isVariant()
      ? component.variants.variantComponents()
      : [component];
    for (const v of list) variants.set(v.id, v);
  }
  return [...variants.values()];
}

async function exportIcons() {
  const queue = collectVariants();
  const total = queue.length;
  const icons = [];
  const errors = [];
  let done = 0;

  async function worker() {
    while (queue.length) {
      const v = queue.shift();
      const name = v.path ? `${v.path}/${v.name}` : v.name;
      const style = v.variantProps?.style;

      if (!STYLES.includes(style)) {
        errors.push(`${name} (${style}): variante sem style outline/solid`);
      } else {
        try {
          const svg = decode(await v.mainInstance().export({ type: 'svg' }));
          icons.push({ name, style, svg });
        } catch (err) {
          errors.push(`${name} (${style}): ${err.message}`);
        }
      }

      done++;
      penpot.ui.sendMessage({ type: 'progress', done, total });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Ordem estável: o JSON não muda se os ícones não mudarem
  icons.sort(
    (a, b) => a.name.localeCompare(b.name) || a.style.localeCompare(b.style)
  );

  return {
    file: { id: penpot.currentFile.id, name: penpot.currentFile.name },
    exportedAt: new Date().toISOString(),
    total: icons.length,
    icons,
    errors,
  };
}

penpot.ui.onMessage((message) => {
  if (message?.type !== 'export') return;

  exportIcons()
    .then((data) => penpot.ui.sendMessage({ type: 'result', data }))
    .catch((err) =>
      penpot.ui.sendMessage({ type: 'error', message: err.message })
    );
});
