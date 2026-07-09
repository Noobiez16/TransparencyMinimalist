import { state, notify } from './state';
import { createTextLayer, createImageLayer } from './engine/document';
import { initCanvas } from './canvas';
import { initLayersPanel } from './layers-panel';
import { initPropertiesPanel } from './properties-panel';
import { initTopbar } from './topbar';
import { initExport } from './export';
import { initRail } from './rail';

initCanvas();
initLayersPanel();
initPropertiesPanel();
initTopbar();
initExport();
initRail();

const text = createTextLayer(state.doc, 'Text Overlay');
text.text = 'Minimalist Editor';
text.y = state.doc.height / 2 - state.doc.height * 0.1;
state.doc.layers.push(text);
const image = createImageLayer(state.doc, 'Background Image');
state.doc.layers.push(image);
state.doc.activeLayerId = text.id;
notify('structure', 'selection', 'canvasConfig', 'composite');
