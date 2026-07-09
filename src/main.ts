import { state, notify } from './state';
import { createTextLayer, createImageLayer } from './engine/document';
import { initCanvas } from './canvas';
import { initLayersPanel } from './layers-panel';
import { initPropertiesPanel } from './properties-panel';
import { initHistoryPanel } from './history-panel';
import { initTopbar } from './topbar';
import { initExport } from './export';
import { initRail } from './rail';
import { initGraphPanel } from './graph-panel';
import * as history from './engine/history';
import { $, icons } from './dom';
import { registerTool, setActiveTool, getActiveTool, allTools } from './engine/tools';
import { moveTool } from './tools/move';
import { handTool } from './tools/hand';
import { zoomTool } from './tools/zoom';

function initHistoryUI(): void {
  const undoBtn = $<HTMLButtonElement>('btn-undo');
  const redoBtn = $<HTMLButtonElement>('btn-redo');
  undoBtn.innerHTML = icons.undo;
  redoBtn.innerHTML = icons.redo;
  const refresh = () => {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  };
  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());
  history.onChange(refresh);
  refresh();
  document.addEventListener('keydown', (e) => {
    const t = document.activeElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as HTMLElement).isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); }
  });
}

registerTool(moveTool);
registerTool(handTool);
registerTool(zoomTool);

let spaceHeld = false;
let toolBeforeSpace: string | null = null;

document.addEventListener('keydown', (e) => {
  const t = document.activeElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t as HTMLElement).isContentEditable)) return;
  if (e.code === 'Space' && !e.repeat && !spaceHeld) {
    spaceHeld = true;
    toolBeforeSpace = getActiveTool().id;
    setActiveTool('hand');
    e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = allTools().find((x) => x.shortcut === e.key.toLowerCase());
  if (tool) setActiveTool(tool.id);
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && spaceHeld) {
    spaceHeld = false;
    if (toolBeforeSpace) setActiveTool(toolBeforeSpace);
    toolBeforeSpace = null;
  }
});

initCanvas();
initLayersPanel();
initPropertiesPanel();
initHistoryPanel();
initTopbar();
initExport();
initRail();
initGraphPanel();
initHistoryUI();

const text = createTextLayer(state.doc, 'Text Overlay');
text.text = 'Minimalist Editor';
text.y = state.doc.height / 2 - state.doc.height * 0.1;
state.doc.layers.push(text);
const image = createImageLayer(state.doc, 'Background Image');
state.doc.layers.push(image);
state.doc.activeLayerId = text.id;
notify('structure', 'selection', 'canvasConfig', 'composite');
