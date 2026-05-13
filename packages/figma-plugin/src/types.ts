import type { EventHandler } from '@create-figma-plugin/utilities';

export interface InsertIconHandler extends EventHandler {
  name: 'INSERT_ICON';
  handler: (data: { iconName: string; svgString: string }) => void;
}
