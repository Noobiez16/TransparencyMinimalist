import { $ } from './dom';

export function initRail(): void {
  const wrapper = document.querySelector('.dashboard-wrapper') as HTMLElement;
  const railLayers = $('rail-layers');
  const railProps = $('rail-props');

  railLayers.addEventListener('click', () => {
    wrapper.classList.toggle('hide-left');
    railLayers.classList.toggle('active');
  });
  railProps.addEventListener('click', () => {
    wrapper.classList.toggle('hide-right');
    railProps.classList.toggle('active');
  });
  $('rail-add-image').addEventListener('click', () => $('btn-add-image').click());
  $('rail-add-text').addEventListener('click', () => $('btn-add-text').click());
}
