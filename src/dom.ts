export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
};
