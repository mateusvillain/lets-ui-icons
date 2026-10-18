/* global penpot */

/*
  Exporta os ícones do arquivo aberto no Penpot para o pull:penpot.

  Cada ícone é uma variante de componente com propriedade `style` =
  outline | solid. O SVG vem do penpot.generateMarkup, que roda local
  (o shape.export() passa pelo exporter do servidor, ~3s por ícone). A
  limpeza fica no pull-icons-penpot.js. O resultado vai para a UI
  (ui.html), que baixa tudo num único lets-ui-icons-penpot.json.
*/

const STYLES = ['outline', 'solid'];

penpot.ui.open("Let's UI Icons · Export", 'ui.html', {
  width: 300,
  height: 360,
});

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

function exportIcons() {
  const icons = [];
  const errors = [];

  for (const v of collectVariants()) {
    const name = v.path ? `${v.path}/${v.name}` : v.name;
    const style = v.variantProps?.style;

    if (!STYLES.includes(style)) {
      errors.push(`${name} (${style}): variante sem style outline/solid`);
      continue;
    }
    try {
      const svg = penpot.generateMarkup([v.mainInstance()], { type: 'svg' });
      icons.push({ name, style, svg });
    } catch (err) {
      errors.push(`${name} (${style}): ${err.message}`);
    }
  }

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

  try {
    penpot.ui.sendMessage({ type: 'result', data: exportIcons() });
  } catch (err) {
    penpot.ui.sendMessage({ type: 'error', message: err.message });
  }
});
