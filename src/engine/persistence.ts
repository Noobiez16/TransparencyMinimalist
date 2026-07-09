import { type Doc, type Layer } from './document';
import { state, notify } from '../state';
import * as history from './history';
import { toast } from '../toast';

interface SerialLayer extends Omit<Layer, 'bitmap'> { bitmap?: string | null }
interface ProjectFile { app: 'minimalist-editor'; version: 1; doc: Omit<Doc, 'layers'> & { layers: SerialLayer[] } }

function canvasToDataUrl(c: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => {
      if (!blob) { reject(new Error('encode failed')); return; }
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('encode failed'));
      r.readAsDataURL(blob);
    }, 'image/png');
  });
}

function dataUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error('bitmap decode failed'));
    img.src = url;
  });
}

export async function serializeDoc(doc: Doc): Promise<string> {
  const layers: SerialLayer[] = [];
  for (const layer of doc.layers) {
    if (layer.kind === 'image') {
      const { bitmap, ...rest } = layer;
      layers.push({ ...rest, bitmap: bitmap ? await canvasToDataUrl(bitmap) : null } as SerialLayer);
    } else {
      layers.push({ ...layer } as SerialLayer);
    }
  }
  const file: ProjectFile = { app: 'minimalist-editor', version: 1, doc: { ...doc, layers } };
  return JSON.stringify(file);
}

export async function deserializeDoc(json: string): Promise<Doc> {
  let parsed: ProjectFile;
  try { parsed = JSON.parse(json); } catch { throw new Error('Not a valid project file.'); }
  if (parsed?.app !== 'minimalist-editor' || !parsed.doc) throw new Error('Not a valid project file.');
  if (parsed.version > 1) throw new Error('This project was saved by a newer version.');
  const layers: Layer[] = [];
  for (const sl of parsed.doc.layers) {
    if (sl.kind === 'image') {
      const bitmap = sl.bitmap ? await dataUrlToCanvas(sl.bitmap) : null;
      layers.push({ ...(sl as object), bitmap, bitmapRev: 0 } as Layer);
    } else {
      layers.push({ ...(sl as object) } as Layer);
    }
  }
  return { ...parsed.doc, layers } as Doc;
}

export async function saveProject(): Promise<void> {
  try {
    const json = await serializeDoc(state.doc);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project_${Date.now()}.mledit.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    history.markSaved();
    toast('Project saved.');
  } catch {
    toast('Saving the project failed.');
  }
}

export async function openProjectFile(file: File): Promise<void> {
  if (history.isDirty() && !window.confirm('Open project? Unsaved changes will be lost.')) return;
  try {
    const doc = await deserializeDoc(await file.text());
    state.doc = doc;
    history.clear();
    history.markSaved();
    notify('structure', 'selection', 'canvasConfig', 'composite');
    toast('Project opened.');
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not open the project file.');
  }
}
