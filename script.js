(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  const colorInput = document.getElementById('color');
  const palette = document.getElementById('palette');
  const sizeInput = document.getElementById('size');
  const sizeValue = document.getElementById('sizeValue');
  const sizePreview = document.getElementById('sizePreview');
  const toolButtons = document.querySelectorAll('.seg-btn');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const clearBtn = document.getElementById('clear');
  const saveBtn = document.getElementById('save');

  const HISTORY_LIMIT = 30;

  const state = {
    tool: 'pen',
    color: colorInput.value,
    size: Number(sizeInput.value),
    drawing: false,
    lastX: 0,
    lastY: 0,
  };

  let undoStack = [];
  let redoStack = [];

  function setupCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width === width && canvas.height === height) return;

    // リサイズで内容が破棄されるため、退避してから描き戻す
    const backup = document.createElement('canvas');
    backup.width = canvas.width;
    backup.height = canvas.height;
    if (canvas.width > 0 && canvas.height > 0) {
      backup.getContext('2d').drawImage(canvas, 0, 0);
    }

    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (backup.width > 0 && backup.height > 0) {
      ctx.drawImage(backup, 0, 0, rect.width, rect.height);
    }

    // 履歴はキャンバスサイズに依存するため、リサイズ後の状態を基準に取り直す
    undoStack = [];
    redoStack = [];
    updateHistoryButtons();
  }

  function pushHistory() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function restore(fromStack, toStack) {
    if (fromStack.length === 0) return;
    toStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    const image = fromStack.pop();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(image, 0, 0);
    ctx.restore();
    updateHistoryButtons();
  }

  function getPos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function applyStroke() {
    ctx.lineWidth = state.size;
    if (state.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = state.color;
    }
  }

  function startDraw(event) {
    if (event.button !== undefined && event.button !== 0) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // キャンバス外までドラッグを追えないだけなので描画は続行する
    }
    pushHistory();
    state.drawing = true;
    const { x, y } = getPos(event);
    state.lastX = x;
    state.lastY = y;

    // クリックだけでも点が残るようにする
    applyStroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function draw(event) {
    if (!state.drawing) return;
    const { x, y } = getPos(event);
    applyStroke();
    ctx.beginPath();
    ctx.moveTo(state.lastX, state.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    state.lastX = x;
    state.lastY = y;
  }

  function endDraw() {
    if (!state.drawing) return;
    state.drawing = false;
    ctx.globalCompositeOperation = 'source-over';
  }

  function updateSizePreview() {
    sizeValue.textContent = String(state.size);
    sizePreview.style.setProperty('--dot', `${Math.min(state.size, 56)}px`);
    sizePreview.style.setProperty('--dot-color', state.tool === 'eraser' ? '#c9cfe0' : state.color);
  }

  canvas.addEventListener('pointerdown', startDraw);
  canvas.addEventListener('pointermove', draw);
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointercancel', endDraw);
  canvas.addEventListener('pointerleave', endDraw);

  toolButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.tool = button.dataset.tool;
      toolButtons.forEach((b) => b.classList.toggle('is-active', b === button));
      canvas.dataset.tool = state.tool;
      updateSizePreview();
    });
  });

  colorInput.addEventListener('input', () => {
    state.color = colorInput.value;
    updateSizePreview();
  });

  palette.addEventListener('click', (event) => {
    const swatch = event.target.closest('.swatch');
    if (!swatch) return;
    state.color = swatch.dataset.color;
    colorInput.value = state.color;
    updateSizePreview();
  });

  sizeInput.addEventListener('input', () => {
    state.size = Number(sizeInput.value);
    updateSizePreview();
  });

  undoBtn.addEventListener('click', () => restore(undoStack, redoStack));
  redoBtn.addEventListener('click', () => restore(redoStack, undoStack));

  clearBtn.addEventListener('click', () => {
    pushHistory();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  });

  saveBtn.addEventListener('click', () => {
    // 透明部分が黒くならないよう、白背景に合成してから書き出す
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const outCtx = output.getContext('2d');
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, output.width, output.height);
    outCtx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `paint-${Date.now()}.png`;
    link.href = output.toDataURL('image/png');
    link.click();
  });

  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    if (event.shiftKey) {
      restore(redoStack, undoStack);
    } else {
      restore(undoStack, redoStack);
    }
  });

  window.addEventListener('resize', setupCanvas);

  setupCanvas();
  updateSizePreview();
  updateHistoryButtons();
})();
