import { $ } from '../dom';

const SHADES: Array<[string, string]> = [
  ['Default', ''],
  ['Dark', '#14181f'],
  ['Darker', '#0b0e13'],
  ['Light', '#3a4150']
];

export function initPasteboard(): void {
  const container = $('canvas-container');
  let menu: HTMLElement | null = null;
  const close = () => { menu?.remove(); menu = null; };
  container.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement;
    if (target !== container && target.id !== 'zoom-wrap') return;
    e.preventDefault();
    close();
    menu = document.createElement('div');
    menu.className = 'pasteboard-menu glass-surface';
    for (const [label, color] of SHADES) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'menu-item';
      item.innerHTML = `<span>${label}</span>`;
      item.addEventListener('click', () => {
        container.style.background = color;
        close();
      });
      menu.appendChild(item);
    }
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    document.body.appendChild(menu);
  });
  document.addEventListener('click', close);
}
