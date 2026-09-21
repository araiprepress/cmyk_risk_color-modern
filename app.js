(() => {
  'use strict';

  const riskyReferences = [
    [0, 255, 0], [0, 255, 128], [0, 255, 255], [0, 128, 255],
    [0, 0, 255], [128, 0, 255], [255, 0, 255], [255, 0, 128]
  ];

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadPrompt = document.getElementById('uploadPrompt');
  const previewState = document.getElementById('previewState');
  const previewImage = document.getElementById('previewImage');
  const resetButton = document.getElementById('resetButton');
  const statusPanel = document.getElementById('statusPanel');
  const results = document.getElementById('results');
  let sourceUrl = '';

  const openPicker = () => fileInput.click();
  dropZone.addEventListener('click', openPicker);
  dropZone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
  }));
  dropZone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  resetButton.addEventListener('click', event => {
    event.stopPropagation();
    fileInput.value = '';
    openPicker();
  });

  document.querySelectorAll('.download-button').forEach(button => {
    button.addEventListener('click', () => {
      const canvas = document.getElementById(button.dataset.canvas);
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = button.dataset.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    });
  });

  function loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください。');
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    previewImage.onload = () => {
      document.getElementById('fileName').textContent = file.name;
      document.getElementById('fileInfo').textContent = `${formatBytes(file.size)} ・ ${previewImage.naturalWidth} × ${previewImage.naturalHeight}px`;
      uploadPrompt.hidden = true;
      previewState.hidden = false;
      resetButton.hidden = false;
      results.hidden = true;
      statusPanel.hidden = false;
      window.setTimeout(() => analyze(previewImage), 60);
    };
    previewImage.src = sourceUrl;
  }

  function analyze(image) {
    try {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      const sourceContext = source.getContext('2d', { willReadFrequently: true });
      sourceContext.drawImage(image, 0, 0);
      const originalData = sourceContext.getImageData(0, 0, width, height);
      const warningData = new ImageData(new Uint8ClampedArray(originalData.data), width, height);
      const saferData = new ImageData(new Uint8ClampedArray(originalData.data), width, height);
      let riskyCount = 0;

      for (let index = 0; index < originalData.data.length; index += 4) {
        const r = originalData.data[index];
        const g = originalData.data[index + 1];
        const b = originalData.data[index + 2];
        if (!isRisky(r, g, b)) continue;
        warningData.data[index] = 230;
        warningData.data[index + 1] = 35;
        warningData.data[index + 2] = 48;
        const gray = (r + g + b) / 3;
        saferData.data[index] = Math.round(r * .88 + gray * .12);
        saferData.data[index + 1] = Math.round(g * .88 + gray * .12);
        saferData.data[index + 2] = Math.round(b * .88 + gray * .12);
        riskyCount++;
      }

      const warningCanvas = document.getElementById('warningCanvas');
      const saferCanvas = document.getElementById('saferCanvas');
      [warningCanvas, saferCanvas].forEach(canvas => { canvas.width = width; canvas.height = height; });
      warningCanvas.getContext('2d').putImageData(warningData, 0, 0);
      saferCanvas.getContext('2d').putImageData(saferData, 0, 0);
      document.getElementById('originalResult').src = sourceUrl;

      const total = width * height;
      const percentage = total ? riskyCount / total * 100 : 0;
      document.getElementById('riskPercentage').textContent = `${percentage.toFixed(2)}%`;
      document.getElementById('riskCount').textContent = `${riskyCount.toLocaleString()} px`;
      document.getElementById('imageDimensions').textContent = `${width.toLocaleString()} × ${height.toLocaleString()}`;
      const summary = document.getElementById('riskSummary');
      summary.classList.toggle('safe', riskyCount === 0);
      document.getElementById('summaryText').textContent = riskyCount === 0 ? '目立ったリスクは検出されませんでした' : riskLevel(percentage);
      statusPanel.hidden = true;
      results.hidden = false;
      results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      statusPanel.hidden = true;
      alert('画像を解析できませんでした。別の画像形式でお試しください。');
    }
  }

  function isRisky(r, g, b) {
    for (const [rr, gg, bb] of riskyReferences) {
      const distance = Math.hypot(r - rr, g - gg, b - bb);
      if (distance <= 30) return true;
    }
    const { hue, saturation } = rgbToHsv(r, g, b);
    if (saturation < .7) return false;
    return (hue >= 100 && hue <= 200) || (hue >= 220 && hue <= 260) || (hue >= 280 && hue <= 320);
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0) hue += 360;
    return { hue, saturation: max === 0 ? 0 : delta / max };
  }

  function riskLevel(percentage) {
    if (percentage >= 30) return 'リスクカラーが広い範囲にあります';
    if (percentage >= 10) return 'リスクカラーが検出されました';
    return '一部にリスクカラーがあります';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
})();
