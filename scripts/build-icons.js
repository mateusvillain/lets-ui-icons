import fs from 'fs';
import path from 'path';

/* Paths */
const SRC_ICONS_DIR = path.resolve('src/icons');
const SRC_STYLES_DIR = path.resolve('src/styles');

const DIST_DIR = path.resolve('dist');
const DIST_ICONS_DIR = path.join(DIST_DIR, 'icons');
const OUTPUT_CSS = path.join(DIST_DIR, 'lets-ui-icons.css');

/* Utils */
function readCss(file) {
  return fs.readFileSync(path.join(SRC_STYLES_DIR, file), 'utf-8');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : fullPath;
  });
}

/* Ensure dist folders */
fs.mkdirSync(DIST_ICONS_DIR, { recursive: true });

/* Base CSS (fonte da verdade) */
let css = `
${readCss('base.css')}
${readCss('sizes.css')}
`;

/*
  Regras:
  - src/icons/outline/{icon}.svg  → .lui.lui-{icon}
  - src/icons/solid/{icon}.svg    → .lui-solid.lui-{icon}
*/

walk(SRC_ICONS_DIR).forEach((file) => {
  if (!file.endsWith('.svg')) return;

  const iconName = path.basename(file, '.svg');

  // outline | solid
  const style = path.basename(path.dirname(file));

  if (style !== 'outline' && style !== 'solid') return;

  const relativePath = path.relative(SRC_ICONS_DIR, file).replace(/\\/g, '/');

  const distSvgPath = path.join(DIST_ICONS_DIR, relativePath);
  const cssSvgPath = `icons/${relativePath}`;

  /* Copy SVG to dist */
  fs.mkdirSync(path.dirname(distSvgPath), { recursive: true });
  fs.copyFileSync(file, distSvgPath);

  /* Decide classe base */
  const baseClass = style === 'solid' ? '.lui-solid' : '.lui';

  /* Generate CSS */
  css += `
${baseClass}.lui-${iconName} {
  mask-image: url("./${cssSvgPath}");
  -webkit-mask-image: url("./${cssSvgPath}");
}
`;
});

/* Write final CSS */
fs.writeFileSync(OUTPUT_CSS, css);

console.log('✔ Ícones gerados com sucesso (outline + solid)!');
