import { $, icons } from './dom';
import { allTools, setActiveTool, onToolChange, getActiveTool } from './engine/tools';
import { guardTransformSession } from './transform-session-guard';

export function initRail(): void {
  const wrapper = document.querySelector('.dashboard-wrapper') as HTMLElement;
  const railLayers = $('rail-layers');
  const railProps = $('rail-props');
  const railAddImage = $('rail-add-image');
  const railAddText = $('rail-add-text');

  const toolsHost = $('rail-tools');
  allTools().forEach((tool) => {
    const btn = document.createElement('button');
    btn.className = 'rail-btn';
    btn.title = `${tool.label} (${tool.shortcut.toUpperCase()})`;
    btn.dataset.tool = tool.id;
    btn.innerHTML = tool.icon;
    btn.addEventListener('click', () => guardTransformSession(() => setActiveTool(tool.id)));
    toolsHost.appendChild(btn);
  });
  const syncToolButtons = () => {
    toolsHost.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.tool === getActiveTool().id));
  };
  onToolChange(syncToolButtons);
  syncToolButtons();

  railLayers.innerHTML = icons.layers;
  railAddImage.innerHTML = icons.plus;
  railAddText.innerHTML = icons.text;
  railProps.innerHTML = icons.sliders;

  railLayers.addEventListener('click', () => {
    wrapper.classList.toggle('hide-left');
    railLayers.classList.toggle('active');
  });
  railProps.addEventListener('click', () => {
    wrapper.classList.toggle('hide-right');
    railProps.classList.toggle('active');
  });
  railAddImage.addEventListener('click', () => $('btn-add-image').click());
  railAddText.addEventListener('click', () => $('btn-add-text').click());
}
