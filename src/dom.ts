export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
};

const svg = (body: string) =>
  `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  eye: svg('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>'),
  eyeOff: svg('<path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><line x1="3" y1="13" x2="13" y2="3"/>'),
  x: svg('<line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>'),
  drag: svg('<line x1="4" y1="5" x2="12" y2="5"/><line x1="4" y1="8" x2="12" y2="8"/><line x1="4" y1="11" x2="12" y2="11"/>'),
  plus: svg('<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>'),
  text: svg('<line x1="3" y1="4" x2="13" y2="4"/><line x1="8" y1="4" x2="8" y2="13"/>'),
  layers: svg('<path d="M8 2 14 5 8 8 2 5Z"/><path d="M2 8.5 8 11.5 14 8.5"/><path d="M2 11.5 8 14.5 14 11.5"/>'),
  sliders: svg('<line x1="3" y1="5" x2="13" y2="5"/><circle cx="6" cy="5" r="1.5" fill="currentColor"/><line x1="3" y1="11" x2="13" y2="11"/><circle cx="10" cy="11" r="1.5" fill="currentColor"/>'),
  undo: svg('<path d="M6 3 2.5 6.5 6 10"/><path d="M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7"/>'),
  redo: svg('<path d="M10 3 13.5 6.5 10 10"/><path d="M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3"/>'),
  move: svg('<path d="M8 2v12M2 8h12"/><path d="M8 2 6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2"/>'),
  hand: svg('<path d="M5 8V4.5a1 1 0 0 1 2 0V8m0-4.5v-1a1 1 0 0 1 2 0V8m0-4a1 1 0 0 1 2 0v5.5"/><path d="M11 9.5c1-1 2.5-.5 2 1l-1.5 3A3 3 0 0 1 8.7 15H8a3 3 0 0 1-3-3V6"/>'),
  zoom: svg('<circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>'),
  open: svg('<path d="M2 5a1 1 0 0 1 1-1h3l1.5 2H13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z"/>'),
  save: svg('<path d="M3 2h8l3 3v9a0 0 0 0 1 0 0H3a0 0 0 0 1 0 0V2Z"/><rect x="5" y="9" width="6" height="5"/><rect x="5" y="2" width="5" height="3"/>')
};

export function inlineEdit(el: HTMLElement, current: string, onCommit: (v: string) => void): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'inline-edit';
  el.replaceWith(input);
  input.focus(); input.select();
  let done = false;
  const finish = (apply: boolean) => {
    if (done) return; done = true;
    input.replaceWith(el);
    if (apply && input.value.trim()) onCommit(input.value.trim());
  };
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
}
