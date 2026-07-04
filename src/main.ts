import { state, createNewLayer, notify } from './state';
import { initCanvas } from './canvas';
import { initLayersPanel } from './layers-panel';
import { initPropertiesPanel } from './properties-panel';
import { initExport } from './export';

initCanvas();
initLayersPanel();
initPropertiesPanel();
initExport();

const text = createNewLayer('text');
text.name = 'Text Overlay';
text.textContent = 'Minimalist Editor';
text.yOffset = -10;
state.layers.push(text);

const image = createNewLayer('image');
image.name = 'Background Image';
state.layers.push(image);

state.activeLayerId = text.id;
notify('structure', 'selection', 'canvasConfig');
