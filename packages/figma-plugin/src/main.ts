import { on, showUI } from '@create-figma-plugin/utilities';
import type {
  ClearDragHandler,
  InsertIconHandler,
  StartDragHandler,
} from './types';

export default function () {
  let pendingDrag: { iconName: string; svgString: string } | null = null;

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

  on<StartDragHandler>('START_DRAG', (data) => {
    pendingDrag = data;
  });

  on<ClearDragHandler>('CLEAR_DRAG', () => {
    pendingDrag = null;
  });

  figma.on('drop', (event) => {
    if (!pendingDrag) return false;
    const { x, y } = event;
    const node = figma.createNodeFromSvg(pendingDrag.svgString);
    node.name = pendingDrag.iconName;
    node.x = x - node.width / 2;
    node.y = y - node.height / 2;
    figma.currentPage.appendChild(node);
    figma.currentPage.selection = [node];
    pendingDrag = null;
    return true;
  });

  showUI({ height: 480, width: 320 });
}
