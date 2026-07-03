interface HiddenEffects {
  blendMode: 'normal' | 'multiply' | 'screen';
  blur: number;
  contrast: number;
  saturation: number;
  brightness: number;
  invert: boolean;
}

interface AppState {
  mainImage: string | null;
  hiddenImage: string | null;
  mainImageName: string | null;
  hiddenImageName: string | null;
  activeLayer: 'main' | 'hidden';
  mainOpacity: number;
  hiddenOpacity: number;
  mainVisible: boolean;
  hiddenVisible: boolean;
  hiddenEffects: HiddenEffects;
  exportRatio: '1:1' | '4:5';
  exportResolution: 1 | 2 | 3;
  theme: 'light' | 'dim' | 'dark';
}

const state: AppState = {
  mainImage: null,
  hiddenImage: null,
  mainImageName: null,
  hiddenImageName: null,
  activeLayer: 'main',
  mainOpacity: 100,
  hiddenOpacity: 4, // Default 4% for hidden image
  mainVisible: true,
  hiddenVisible: true,
  hiddenEffects: {
    blendMode: 'normal',
    blur: 0,
    contrast: 100,
    saturation: 100,
    brightness: 100,
    invert: false
  },
  exportRatio: '1:1',
  exportResolution: 2,
  theme: 'light'
};

// DOM Selection Helper
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element with id ${id} not found`);
  return el as T;
};

// Drag and Drop File Handlers & Caching
const uploadZone = $('upload-zone');
const fileInput = $('file-input') as HTMLInputElement;

const imgMain = $('layer-main') as HTMLImageElement;
const previewBoxMain = $('preview-box-main');
const fileInfoMain = $('file-info-main');

const imgHidden = $('layer-hidden') as HTMLImageElement;
const previewBoxHidden = $('preview-box-hidden');
const fileInfoHidden = $('file-info-hidden');

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleUploadedFiles(files);
  }
});

fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  if (files && files.length > 0) {
    handleUploadedFiles(files);
  }
});

function handleUploadedFiles(files: FileList) {
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!state.mainImage) {
        state.mainImage = dataUrl;
        state.mainImageName = file.name;
      } else {
        state.hiddenImage = dataUrl;
        state.hiddenImageName = file.name;
      }
      updateUI();
    };
    reader.readAsDataURL(file);
  });
}

function updateUI() {
  // Update main preview panel source
  if (state.mainImage) {
    imgMain.src = state.mainImage;
    imgMain.style.display = 'block';
    previewBoxMain.innerHTML = `<img src="${state.mainImage}" alt="Main Image">`;
    fileInfoMain.textContent = state.mainImageName || 'image_main.png';
  } else {
    imgMain.style.display = 'none';
    previewBoxMain.innerHTML = `<span class="placeholder">No Image</span>`;
    fileInfoMain.textContent = 'No file selected';
  }

  // Update hidden preview panel source
  if (state.hiddenImage) {
    imgHidden.src = state.hiddenImage;
    imgHidden.style.display = 'block';
    previewBoxHidden.innerHTML = `<img src="${state.hiddenImage}" alt="Hidden Image">`;
    fileInfoHidden.textContent = state.hiddenImageName || 'image_hidden.png';
  } else {
    imgHidden.style.display = 'none';
    previewBoxHidden.innerHTML = `<span class="placeholder">No Image</span>`;
    fileInfoHidden.textContent = 'No file selected';
  }
}

// Swap Role Buttons
document.querySelectorAll('.btn-swap').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tempImg = state.mainImage;
    const tempName = state.mainImageName;

    state.mainImage = state.hiddenImage;
    state.mainImageName = state.hiddenImageName;

    state.hiddenImage = tempImg;
    state.hiddenImageName = tempName;

    updateUI();
  });
});
