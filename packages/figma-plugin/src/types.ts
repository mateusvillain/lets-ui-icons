import type { EventHandler } from '@create-figma-plugin/utilities';

export interface InsertIconHandler extends EventHandler {
  name: 'INSERT_ICON';
  handler: (data: { iconName: string; svgString: string }) => void;
}

export interface StartDragHandler extends EventHandler {
  name: 'START_DRAG';
  handler: (data: { iconName: string; svgString: string }) => void;
}

export interface ClearDragHandler extends EventHandler {
  name: 'CLEAR_DRAG';
  handler: () => void;
}
