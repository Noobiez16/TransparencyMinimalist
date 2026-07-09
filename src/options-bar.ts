import { getActiveTool, onToolChange, type ToolOption } from './engine/tools';
import { $ } from './dom';

function renderOption(opt: ToolOption): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'opt';
  const label = document.createElement('span');
  label.className = 'opt-label';
  label.textContent = opt.label;
  wrap.appendChild(label);
  if (opt.kind === 'display') {
    const val = document.createElement('span');
    val.className = 'opt-value';
    val.textContent = String(opt.get());
    wrap.appendChild(val);
  } else if (opt.kind === 'slider') {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(opt.min ?? 0); input.max = String(opt.max ?? 100);
    input.value = String(opt.get());
    input.addEventListener('input', () => opt.set(parseInt(input.value, 10)));
    wrap.appendChild(input);
  } else if (opt.kind === 'toggle') {
    const btn = document.createElement('button');
    btn.className = 'switch';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(Boolean(opt.get())));
    btn.addEventListener('click', () => { const v = !opt.get(); opt.set(v); btn.setAttribute('aria-checked', String(v)); });
    wrap.appendChild(btn);
  } else {
    const sel = document.createElement('select');
    (opt.choices ?? []).forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
    sel.value = String(opt.get());
    sel.addEventListener('change', () => opt.set(sel.value));
    wrap.appendChild(sel);
  }
  return wrap;
}

export function initOptionsBar(): void {
  const host = $('options-host');
  const render = () => {
    host.innerHTML = '';
    const opts = getActiveTool().options ?? [];
    if (!opts.length) {
      const empty = document.createElement('span');
      empty.className = 'options-empty';
      empty.textContent = `${getActiveTool().label} — no options`;
      host.appendChild(empty);
      return;
    }
    opts.forEach((o) => host.appendChild(renderOption(o)));
  };
  onToolChange(render);
  render();
}
