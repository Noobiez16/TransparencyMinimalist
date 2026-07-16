import { state, notify } from './state';
import { createTextLayer, createImageLayer } from './engine/document';
import { initCanvas } from './canvas';
import { initLayersPanel } from './layers-panel';
import { initPropertiesPanel } from './properties-panel';
import { initHistoryPanel } from './history-panel';
import { initTopbar } from './topbar';
import { initExport } from './export';
import { initRail } from './rail';
import { initOptionsBar } from './options-bar';
import * as history from './engine/history';
import { $, icons } from './dom';
import { registerTool, setActiveTool, getActiveTool, allTools, onToolChange } from './engine/tools';
import { moveTool } from './tools/move';
import { handTool } from './tools/hand';
import { zoomTool } from './tools/zoom';
import { cropTool } from './tools/crop';
import { initAutosave, tryRestoreOffer } from './engine/persistence';
import { applyTransform, beginTransform, cancelTransform, getTransformSession, subscribeTransformSession } from './engine/transform-session';
import { applyCrop, beginCrop, cancelCrop, getCropSession, subscribeCropSession } from './engine/crop-session';
import { toast } from './toast';
import { guardTransformSession, initTransformSessionGuard, isInteractiveTarget, isTransformSessionGuardOpen, isTypingTarget } from './transform-session-guard';
import { isEditingSessionLive } from './engine/session-status';

/**
 * History navigation must stay quiet while any editing session is live:
 * a mid-gesture undo would desync cached snap candidates and can silently
 * abandon the user's in-progress edit.
 */
function historySessionBlocked(): boolean {
  return isEditingSessionLive();
}

function initHistoryUI(): void {
  const undoBtn = $<HTMLButtonElement>('btn-undo');
  const redoBtn = $<HTMLButtonElement>('btn-redo');
  undoBtn.innerHTML = icons.undo;
  redoBtn.innerHTML = icons.redo;
  const refresh = () => {
    undoBtn.disabled = !history.canUndo() || historySessionBlocked();
    redoBtn.disabled = !history.canRedo() || historySessionBlocked();
  };
  undoBtn.addEventListener('click', () => { if (!historySessionBlocked()) history.undo(); });
  redoBtn.addEventListener('click', () => { if (!historySessionBlocked()) history.redo(); });
  history.onChange(refresh);
  subscribeTransformSession(refresh);
  subscribeCropSession(refresh);
  refresh();
  document.addEventListener('keydown', (e) => {
    const t = document.activeElement;
    if (isTypingTarget(t) || historySessionBlocked()) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); }
  });
}

registerTool(moveTool);
registerTool(handTool);
registerTool(zoomTool);
registerTool(cropTool);

// The Crop tool owns exactly one session: entering the tool opens it,
// leaving the tool (or Enter/Escape below) closes it.
let lastToolId = getActiveTool().id;
onToolChange((tool) => {
  if (lastToolId === 'crop' && tool.id !== 'crop') cancelCrop();
  if (tool.id === 'crop' && !getCropSession()) beginCrop();
  lastToolId = tool.id;
});

let spaceHeld = false;
let toolBeforeSpace: string | null = null;

document.addEventListener('keydown', (e) => {
  const t = document.activeElement;
  if (isTypingTarget(t) || isTransformSessionGuardOpen()) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    const activeLayer = state.doc.layers.find((layer) => layer.id === state.doc.activeLayerId);
    if (!activeLayer) { toast('Select a layer before starting Free Transform.'); return; }
    if (getTransformSession()) return;
    setActiveTool('move');
    beginTransform(activeLayer.id, 'explicit');
    return;
  }
  // Enter, Escape, and Space keep their native semantics on focused buttons/links.
  const buttonLikeFocused = isInteractiveTarget(t);
  if (!buttonLikeFocused) {
    const transformSession = getTransformSession();
    if (transformSession?.mode === 'explicit' && e.key === 'Enter') { e.preventDefault(); applyTransform(); return; }
    if (transformSession?.mode === 'explicit' && e.key === 'Escape') { e.preventDefault(); cancelTransform(); return; }
    if (getCropSession() && e.key === 'Enter') { e.preventDefault(); applyCrop(); setActiveTool('move'); return; }
    if (getCropSession() && e.key === 'Escape') { e.preventDefault(); cancelCrop(); setActiveTool('move'); return; }
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Space' && !e.repeat && !spaceHeld) {
      spaceHeld = true;
      toolBeforeSpace = getActiveTool().id;
      setActiveTool('hand');
      return;
    }
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = allTools().find((x) => x.shortcut === e.key.toLowerCase());
  if (tool) guardTransformSession(() => setActiveTool(tool.id));
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && spaceHeld) {
    spaceHeld = false;
    if (toolBeforeSpace) setActiveTool(toolBeforeSpace);
    toolBeforeSpace = null;
  }
});

initTransformSessionGuard();
initCanvas();
initLayersPanel();
initPropertiesPanel();
initHistoryPanel();
initTopbar();
initExport();
initRail();
initOptionsBar();
initHistoryUI();

const syncContextStatus = () => {
  const session = getTransformSession();
  const status = $('status-context');
  if (getCropSession()) {
    status.textContent = 'Crop · Drag handles or edit ratio · Enter applies · Esc cancels';
  } else if (session?.mode === 'explicit') {
    status.textContent = session.gesture
      ? 'Free Transform · Shift constrains · Enter applies · Esc cancels'
      : 'Free Transform · Drag handles or edit fields · Enter applies · Esc cancels';
  } else if (session?.gesture) {
    status.textContent = 'Transforming · Shift constrains';
  } else {
    const tool = getActiveTool();
    if (tool.id === 'hand') status.textContent = 'Hand · Drag to pan the view';
    else if (tool.id === 'zoom') status.textContent = 'Zoom · Click to zoom in · Alt-click zooms out';
    else if (tool.id === 'crop') status.textContent = 'Crop · Click the canvas to start a crop';
    else status.textContent = `${tool.label} · Shift constrains · Ctrl/Cmd bypasses Snap`;
  }
};
onToolChange(syncContextStatus);
subscribeTransformSession(syncContextStatus);
subscribeCropSession(syncContextStatus);
syncContextStatus();

const text = createTextLayer(state.doc, 'Text Overlay');
text.text = 'Minimalist Editor';
text.y = state.doc.height / 2 - state.doc.height * 0.1;
state.doc.layers.push(text);
const image = createImageLayer(state.doc, 'Background Image');
state.doc.layers.push(image);
state.doc.activeLayerId = text.id;
notify('structure', 'selection', 'canvasConfig', 'composite');

initAutosave();
void tryRestoreOffer();
