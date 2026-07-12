import { type Doc, type Layer } from './document';
import { state, notify } from '../state';
import * as history from './history';
import { toast } from '../toast';

interface SerialLayer extends Omit<Layer, 'bitmap'> { bitmap?: string | null }
interface ProjectFile { app: 'minimalist-editor'; version: 2; doc: Omit<Doc, 'layers'> & { layers: SerialLayer[] } }

interface RawProjectFile {
  app?: unknown;
  version?: unknown;
  doc?: Record<string, unknown>;
}

export function migrateSerialLayer(raw: Record<string, unknown>, fileVersion: 1 | 2): Record<string, unknown> {
  const { scale, scaleX, scaleY, rotation, ...layer } = raw;
  const finiteOr = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const legacyScale = fileVersion === 1 ? finiteOr(scale, 100) : 100;
  return {
    ...layer,
    scaleX: finiteOr(scaleX, legacyScale),
    scaleY: finiteOr(scaleY, legacyScale),
    rotation: finiteOr(rotation, 0)
  };
}

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
  const file: ProjectFile = { app: 'minimalist-editor', version: 2, doc: { ...doc, version: 2, layers } };
  return JSON.stringify(file);
}

export async function deserializeDoc(json: string): Promise<Doc> {
  let parsed: RawProjectFile;
  try { parsed = JSON.parse(json) as RawProjectFile; } catch { throw new Error('Not a valid project file.'); }
  if (parsed?.app !== 'minimalist-editor' || !parsed.doc) throw new Error('Not a valid project file.');
  if (parsed.version !== 1 && parsed.version !== 2) {
    if (typeof parsed.version === 'number' && Number.isInteger(parsed.version) && parsed.version > 2) {
      throw new Error('This project was saved by a newer version.');
    }
    throw new Error('Not a valid project file.');
  }
  const fileVersion = parsed.version;
  if (!Array.isArray(parsed.doc.layers)) throw new Error('Not a valid project file.');
  const layers: Layer[] = [];
  for (const rawLayer of parsed.doc.layers) {
    if (!rawLayer || typeof rawLayer !== 'object') throw new Error('Not a valid project file.');
    const sl = migrateSerialLayer(rawLayer as Record<string, unknown>, fileVersion);
    if (sl.kind === 'image') {
      const bitmap = typeof sl.bitmap === 'string' ? await dataUrlToCanvas(sl.bitmap) : null;
      layers.push({ ...(sl as object), bitmap, bitmapRev: 0 } as Layer);
    } else {
      layers.push({ ...(sl as object) } as Layer);
    }
  }
  return { ...parsed.doc, version: 2, layers } as unknown as Doc;
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

const DB_NAME = 'mledit';
const STORE = 'autosave';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, 'latest');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('latest');
    req.onsuccess = () => resolve((req.result as string) ?? null);
    req.onerror = () => reject(req.error);
  });
}

let autosaveTimer: number | null = null;
let autosaveErrorShown = false;
let autosaveChain: Promise<void> = Promise.resolve();

export function initAutosave(): void {
  history.onChange(() => {
    if (autosaveTimer !== null) clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveChain = autosaveChain.then(async () => {
        try {
          await idbPut(await serializeDoc(state.doc));
        } catch (err) {
          if (!autosaveErrorShown) { autosaveErrorShown = true; toast('Autosave is unavailable.'); }
          console.error('autosave failed', err);
        }
      });
    }, 2000);
  });
}

export async function tryRestoreOffer(): Promise<void> {
  try {
    const json = await idbGet();
    if (!json) return;
    toast('A previous session was found.', {
      actionLabel: 'Restore',
      duration: 10000,
      onAction: async () => {
        try {
          state.doc = await deserializeDoc(json);
          history.clear();
          history.markSaved();
          notify('structure', 'selection', 'canvasConfig', 'composite');
        } catch { toast('Could not restore the previous session.'); }
      }
    });
  } catch (err) { console.error('restore check failed', err); }
}
