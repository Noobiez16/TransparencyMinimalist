import { $, icons } from './dom';

export function initRail(): void {
  const wrapper = document.querySelector('.dashboard-wrapper') as HTMLElement;
  const railLayers = $('rail-layers');
  const railProps = $('rail-props');
  const railAddImage = $('rail-add-image');
  const railAddText = $('rail-add-text');

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
