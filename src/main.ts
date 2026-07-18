import { state, notify } from './state';
import { createTextLayer, createImageLayer } from './engine/document';
import { initCanvas } from './canvas';
import { initLayersPanel } from './layers-panel';
import { initPropertiesPanel } from './properties-panel';
import { initHistoryPanel } from './history-panel';
import { initTopbar } from './topbar';
import { exportComposition } from './export';
import { saveProject } from './engine/persistence';
import { registerCommand } from './shell/commands';
import { initMenuBar } from './shell/menu-bar';
import { zoomAt, resetView } from './canvas';
import { getSnapEnabled, setSnapEnabled } from './tools/move';
import { cmdDeleteLayer } from './engine/commands';
import { initRail } from './rail';
import { initOptionsBar } from './options-bar';
import * as history from './engine/history';
import { $ } from './dom';
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
import { initDock } from './shell/dock';

/**
 * History navigation must stay quiet while any editing session is live:
 * a mid-gesture undo would desync cached snap candidates and can silently
 * abandon the user's in-progress edit.
 */
function historySessionBlocked(): boolean {
  return isEditingSessionLive();
}

function initHistoryUI(): void {
  document.addEventListener('keydown', (e) => {
    const t = document.activeElement;
    if (isTypingTarget(t) || historySessionBlocked()) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); }
  });
}

function startFreeTransform(): void {
  const activeLayer = state.doc.layers.find((layer) => layer.id === state.doc.activeLayerId);
  if (!activeLayer) { toast('Select a layer before starting Free Transform.'); return; }
  if (getTransformSession()) return;
  setActiveTool('move');
  beginTransform(activeLayer.id, 'explicit');
}

registerCommand({ id: 'file.new', label: 'New Document…', shortcut: 'Ctrl+N', phase: 'F' });
registerCommand({ id: 'file.open', label: 'Open…', shortcut: 'Ctrl+O', bindKey: true, legacyId: 'btn-open', run: () => guardTransformSession(() => ($('project-input') as unknown as HTMLInputElement).click()) });
registerCommand({ id: 'file.place', label: 'Place Embedded…', run: () => guardTransformSession(() => ($('file-input') as unknown as HTMLInputElement).click()) });
registerCommand({ id: 'file.save', label: 'Save Project', shortcut: 'Ctrl+S', bindKey: true, legacyId: 'btn-save', run: () => { void saveProject(); } });
registerCommand({ id: 'file.export', label: 'Export PNG…', legacyId: 'btn-export', run: () => exportComposition() });
registerCommand({ id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', legacyId: 'btn-undo', enabled: () => history.canUndo() && !historySessionBlocked(), run: () => history.undo() });
registerCommand({ id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', legacyId: 'btn-redo', enabled: () => history.canRedo() && !historySessionBlocked(), run: () => history.redo() });
registerCommand({ id: 'edit.freeTransform', label: 'Free Transform', shortcut: 'Ctrl+T', enabled: () => Boolean(state.doc.activeLayerId), run: () => startFreeTransform() });
// Deferred a tick: the menu-item click still has to bubble past the size menu's
// own close-on-outside-click handler before we reveal it.
registerCommand({ id: 'image.canvasSize', label: 'Canvas Size…', run: () => { setTimeout(() => { $('size-menu').hidden = false; }, 0); } });
registerCommand({ id: 'image.imageSize', label: 'Image Size…', phase: 'F' });
registerCommand({ id: 'image.mode', label: 'Mode', phase: 'E' });
registerCommand({ id: 'layer.newImage', label: 'New Image Layer', run: () => $('btn-add-image').click() });
registerCommand({ id: 'layer.newText', label: 'New Text Layer', run: () => $('btn-add-text').click() });
registerCommand({
  id: 'layer.delete', label: 'Delete Layer',
  enabled: () => Boolean(state.doc.activeLayerId),
  run: () => guardTransformSession(() => {
    const id = state.doc.activeLayerId;
    if (id) history.push(cmdDeleteLayer(id, 'Delete layer'));
  })
});
registerCommand({ id: 'layer.group', label: 'Group Layers', shortcut: 'Ctrl+G', phase: 'E' });
registerCommand({ id: 'view.zoomIn', label: 'Zoom In', shortcut: 'Ctrl+=', bindKey: true, run: () => zoomAt(1.25) });
registerCommand({ id: 'view.zoomOut', label: 'Zoom Out', shortcut: 'Ctrl+-', bindKey: true, run: () => zoomAt(0.8) });
registerCommand({ id: 'view.fit', label: 'Fit on Screen', shortcut: 'Ctrl+0', bindKey: true, run: () => resetView() });
registerCommand({ id: 'view.snap', label: 'Snap To', checked: () => getSnapEnabled(), run: () => setSnapEnabled(!getSnapEnabled()) });
registerCommand({ id: 'type.rasterize', label: 'Rasterize Type', phase: 'D' });
registerCommand({ id: 'type.convertShape', label: 'Convert to Shape', phase: 'D' });
registerCommand({ id: 'select.all', label: 'Select All', shortcut: 'Ctrl+A', phase: 'C' });
registerCommand({ id: 'select.deselect', label: 'Deselect', shortcut: 'Ctrl+D', phase: 'C' });
registerCommand({ id: 'select.inverse', label: 'Inverse', shortcut: 'Shift+Ctrl+I', phase: 'C' });
registerCommand({ id: 'select.subject', label: 'Select Subject', phase: 'C' });
registerCommand({ id: 'filter.gallery', label: 'Filter Gallery…', phase: 'E' });
registerCommand({ id: 'filter.gaussianBlur', label: 'Gaussian Blur…', phase: 'E' });
registerCommand({ id: 'filter.liquify', label: 'Liquify…', shortcut: 'Shift+Ctrl+X', phase: 'E' });
registerCommand({ id: 'plugins.marketplace', label: 'Plugin Marketplace', phase: 'F' });
registerCommand({
  id: 'help.about', label: 'About / System Info',
  run: () => toast(`Transparency — ${state.doc.width}×${state.doc.height}, ${state.doc.layers.length} layers, v2 document`, { duration: 6000 })
});

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
    startFreeTransform();
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

initMenuBar();
initTransformSessionGuard();
initCanvas();
initLayersPanel();
initPropertiesPanel();
initHistoryPanel();
initTopbar();
initRail();
initOptionsBar();
initHistoryUI();
initDock();

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
