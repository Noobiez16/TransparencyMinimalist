export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
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
