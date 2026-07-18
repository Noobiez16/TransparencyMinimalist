export interface ToolEntry { tool: string }
export interface StubEntry { stub: string; key: string; phase: 'B' | 'C' | 'D' | 'E' | 'F' }
export type GroupEntry = ToolEntry | StubEntry;

export const TOOL_GROUPS: Array<{ id: string; entries: GroupEntry[] }> = [
  { id: 'move-select', entries: [{ tool: 'move' }, { stub: 'Rectangular Marquee', key: 'M', phase: 'C' }, { stub: 'Lasso', key: 'L', phase: 'C' }, { stub: 'Object Selection', key: 'W', phase: 'C' }] },
  { id: 'crop-slice', entries: [{ tool: 'crop' }, { stub: 'Frame Tool', key: 'K', phase: 'F' }] },
  { id: 'measure', entries: [{ stub: 'Eyedropper', key: 'I', phase: 'B' }] },
  { id: 'retouch', entries: [{ stub: 'Spot Healing Brush', key: 'J', phase: 'B' }, { stub: 'Clone Stamp', key: 'S', phase: 'B' }] },
  { id: 'paint', entries: [{ stub: 'Brush', key: 'B', phase: 'B' }, { stub: 'Eraser', key: 'E', phase: 'B' }] },
  { id: 'draw', entries: [{ stub: 'Pen', key: 'P', phase: 'D' }, { stub: 'Rectangle', key: 'U', phase: 'D' }] },
  { id: 'type', entries: [{ stub: 'Horizontal Type', key: 'T', phase: 'D' }] },
  { id: 'nav', entries: [{ tool: 'hand' }, { tool: 'zoom' }, { stub: 'Rotate View', key: 'R', phase: 'D' }] }
];
