export interface ToolEntry { tool: string }
export interface StubEntry { stub: string; key: string; phase: 'B' | 'C' | 'D' | 'E' | 'F' }
export type GroupEntry = ToolEntry | StubEntry;

export const TOOL_GROUPS: Array<{ id: string; entries: GroupEntry[] }> = [
  { id: 'move-select', entries: [{ tool: 'move' }, { tool: 'marquee-rect' }, { tool: 'marquee-ellipse' }, { tool: 'lasso-free' }, { tool: 'lasso-poly' }, { stub: 'Object Selection', key: 'W', phase: 'E' }] },
  { id: 'crop-slice', entries: [{ tool: 'crop' }, { stub: 'Frame Tool', key: 'K', phase: 'F' }] },
  { id: 'measure', entries: [{ tool: 'eyedropper' }] },
  { id: 'retouch', entries: [{ stub: 'Spot Healing Brush', key: 'J', phase: 'B' }, { stub: 'Clone Stamp', key: 'S', phase: 'B' }] },
  { id: 'paint', entries: [{ tool: 'brush' }, { tool: 'pencil' }, { stub: 'Mixer Brush', key: 'B', phase: 'E' }] },
  { id: 'erase', entries: [{ tool: 'eraser' }, { stub: 'Background Eraser', key: 'E', phase: 'E' }] },
  { id: 'draw', entries: [{ stub: 'Pen', key: 'P', phase: 'D' }, { stub: 'Rectangle', key: 'U', phase: 'D' }] },
  { id: 'type', entries: [{ stub: 'Horizontal Type', key: 'T', phase: 'D' }] },
  { id: 'nav', entries: [{ tool: 'hand' }, { tool: 'zoom' }, { stub: 'Rotate View', key: 'R', phase: 'D' }] }
];
