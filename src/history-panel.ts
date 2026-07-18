import * as history from './engine/history';
import { $ } from './dom';
import { isEditingSessionLive } from './engine/session-status';

export function initHistoryPanel(): void {
  const list = $('history-list');
  const render = () => {
    list.innerHTML = '';
    const cur = history.cursor();
    history.entries().forEach((entry, i) => {
      const row = document.createElement('button');
      row.className = 'history-row' + (i === cur ? ' current' : '') + (i > cur ? ' undone' : '');
      row.textContent = entry.label;
      row.addEventListener('click', () => {
        if (isEditingSessionLive()) return;
        history.jump(i);
      });
      list.prepend(row);            // newest first
    });
    if (!history.entries().length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No actions yet.';
      list.appendChild(empty);
    }
  };
  history.onChange(render);
  render();
}
