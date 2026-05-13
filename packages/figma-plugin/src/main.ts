import { on, showUI } from '@create-figma-plugin/utilities';
import type { InsertIconHandler } from './types';

export default function () {
  on<InsertIconHandler>('INSERT_ICON', ({ iconName, svgString }) => {
    const node = figma.createNodeFromSvg(svgString);
    node.name = iconName;
    const { x, y, width, height } = figma.viewport.bounds;
    node.x = x + width / 2 - node.width / 2;
    node.y = y + height / 2 - node.height / 2;
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
  });

  showUI({ height: 480, width: 320 });
}
