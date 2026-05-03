// file.js - frontend logic
// - Adds AI Creativity control (Free / Medium / None) and an option to include or ignore user/tone in instructions.
// - Frontend embeds the chosen system text into the instruction and includes system_message, temperature, and strict in the payload (no server changes required).
// - Implements a client-side card editor: background upload/presets, drag-to-position text, font/color/align controls, and render/export (JPEG / clipboard).
// - Preserves the existing AI refine workflow and integrates rendering so the canvas updates after refines.
(() => {
  const DEFAULT_NAME = 'John';
  const DEFAULT_AGE = '25';
  const DEFAULT_HOBBY = 'AI';
  const COOLDOWN_MS = 8000; // 8s between server calls

  const nameEl = document.getElementById('name');
  const ageEl = document.getElementById('age');
  const hobbyEl = document.getElementById('hobby');
  const aiInstructionEl = document.getElementById('aiInstruction');
  const aiCreativityEl = document.getElementById('aiCreativity');
  const toneEl = document.getElementById('toneSelect');
  const msgEl = document.getElementById('message');
  const genStatus = document.getElementById('genStatus');
  const refineStatus = document.getElementById('refineStatus');
  const serverState = document.getElementById('serverState');
  const lastAction = document.getElementById('lastAction');

  const generateBtn = document.getElementById('generateBtn');
  const resetBtn = document.getElementById('resetBtn');
  const refineBtn = document.getElementById('refineBtn');
  const shortenBtn = document.getElementById('shortenBtn');
  const funnierBtn = document.getElementById('funnierBtn');

  const cardCanvas = document.getElementById('cardCanvas');
  const ctx = cardCanvas.getContext('2d');
  const bgUpload = document.getElementById('bgUpload');
  const bgPresets = document.getElementById('bgPresets');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyImageBtn = document.getElementById('copyImageBtn');
  const renderBtn = document.getElementById('renderBtn');
  const canvasStatus = document.getElementById('canvasStatus');
  const fontSizeEl = document.getElementById('fontSize');
  const fontFamilyEl = document.getElementById('fontFamily');
  const fontColorEl = document.getElementById('fontColor');
  const textAlignEl = document.getElementById('textAlign');

  const templates = [
    (n,a,h) => `Happy ${a}th birthday, ${n}! You're now officially a classic — like vintage books, but with better stories. Keep enjoying ${h}!`,
    (n,a,h) => `${n}, ${a} looks great on you — almost as good as your ${h} skills.`,
    (n,a,h) => `Happy birthday, ${n}! At ${a} you're the perfect mix of wisdom and fun. Don't stop ${h}!`,
    (n,a,h) => `Congrats ${n}! ${a} years of awesome. If ${h} gave you points, you'd be a legend.`,
    (n,a,h) => `Cheers ${n}! ${a} years young and still making time for ${h}.`
  ];

  const ALLOWED_FONTS = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Courier New',
    'sans-serif',
    'Comic Sans MS',
    'Dancing Script',
    'Great Vibes'
  ];

  function simpleFunnyMessage(name, age, hobby) {
    const fn = templates[Math.floor(Math.random()*templates.length)];
    return fn(name, age, hobby);
  }

  // System messages driven by AI Creativity setting
  // (Friendly system used for Free/Medium; Strict editor system used for None)
  // Also: frontend embeds the chosen system text into the instruction string and exposes
  // temperature/strict fields in the payload for visibility and future server-side use.
  const SYS_FRIENDLY = "You are a helpful assistant that rewrites short birthday card messages to be funny and friendly.";
  const SYS_STRICT = "You are an exact editor. Only perform the explicit edits requested. Do NOT paraphrase, reword, expand, or summarize the text. Preserve all wording, punctuation, spacing, and capitalization except for the requested edit. Return ONLY the final edited message text with no quotes, explanations, or extra formatting.";

  // Map AI Creativity to temperature + strict behavior
  function mapCreativity(mode) {
    // mode: 'free' | 'medium' | 'none'
    if (mode === 'free') return { temperature: 0.8, strict: false, system: SYS_FRIENDLY };
    if (mode === 'medium') return { temperature: 0.4, strict: false, system: SYS_FRIENDLY };
    // none => strict
    return { temperature: 0.0, strict: true, system: SYS_STRICT };
  }

  // Build instruction: include tone and user's AI instruction only when includeUser is true.
  // This allows buttons like "Make it Shorter" and "Make it Funnier" to ignore user/tone.
  // (Combined comment: preserves original behavior while clarifying that system text is always prepended)
  function buildInstruction(buttonInstruction, includeUser = true) {
    const rawUser = (aiInstructionEl && aiInstructionEl.value) ? aiInstructionEl.value.trim() : '';
    const user = rawUser.slice(0, 1000); // limit length
    const tone = (toneEl && toneEl.value) ? toneEl.value : '';
    const creativity = aiCreativityEl ? aiCreativityEl.value : 'medium';
    const map = mapCreativity(creativity);
    const systemText = map.system;

    // Compose the core user instruction: if includeUser is true, use user + buttonInstruction,
    // otherwise use only buttonInstruction (ignore user instruction and tone).
    let instrCore = includeUser && user ? `${user}. ${buttonInstruction}` : buttonInstruction;
    if (includeUser && tone) instrCore = `${tone} style. ${instrCore}`;

    // Prepend the system-like sentence (so the model sees it as part of the instruction)
    // This ensures the frontend controls "system behavior" without server changes.
    const finalInstr = `${systemText} ${instrCore}`;
    return finalInstr;
  }

  let lastRefineTime = 0;
  function disableButtons(disabled) {
    [generateBtn, resetBtn, refineBtn, shortenBtn, funnierBtn].forEach(b => { if (b) b.disabled = disabled; });
  }

  //
  // Card editor state & helpers
  //
  let bgImage = null;
  let textPos = { x: cardCanvas.width/2, y: cardCanvas.height/2 };
  let dragging = false;
  let dragOffset = { x:0, y:0 };

  function clearCanvas() {
    ctx.clearRect(0,0,cardCanvas.width, cardCanvas.height);
  }

  function drawBackground() {
    if (!bgImage) {
      // draw simple gradient background
      const g = ctx.createLinearGradient(0,0,0,cardCanvas.height);
      g.addColorStop(0, '#ffefba');
      g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,cardCanvas.width, cardCanvas.height);
      return;
    }
    // draw the background covering the canvas (cover behavior)
    const cw = cardCanvas.width, ch = cardCanvas.height;
    const iw = bgImage.width, ih = bgImage.height;
    const scale = Math.max(cw/iw, ch/ih);
    const w = iw * scale, h = ih * scale;
    const dx = (cw - w)/2, dy = (ch - h)/2;
    ctx.drawImage(bgImage, dx, dy, w, h);
  }

  function wrapTextLines(text, maxWidth, font) {
    ctx.font = font;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (let n=0; n<words.length; n++) {
      const testLine = line ? (line + ' ' + words[n]) : words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        lines.push(line);
        line = words[n];
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawTextOnCanvas(text) {
    const color = fontColorEl.value || '#fff';
    const align = textAlignEl.value || 'center';

    const fontSize = parseInt(fontSizeEl.value || '48', 10);
    let family = (fontFamilyEl && fontFamilyEl.value) ? fontFamilyEl.value : 'Arial';
    // validate selected font family
    if (!ALLOWED_FONTS.includes(family)) throw new Error(`Invalid font family: ${family}`);
    // quote family if it contains spaces
    if (family.includes(' ')) family = `"${family}"`;
    const font = `${fontSize}px ${family}`;
    ctx.font = font;

    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(2, Math.floor(fontSize / 18));

    const maxWidth = cardCanvas.width * 0.8;
    const lines = wrapTextLines(text, maxWidth, font);
    const lineHeight = fontSize * 1.2;
    // starting Y: textPos.y - (totalHeight/2) so that textPos is center of block
    const totalHeight = lines.length * lineHeight;
    let startY = textPos.y - totalHeight / 2 + lineHeight / 2;

    for (let i = 0; i < lines.length; i++) {
      const y = startY + i * lineHeight;
      // stroke for readability
      ctx.strokeText(lines[i], textPos.x, y);
      ctx.fillText(lines[i], textPos.x, y);
    }
  }

  function renderCard() {
    clearCanvas();
    drawBackground();
    canvasStatus.textContent = '';
    // draw a subtle vignette for nicer text contrast
    const g = ctx.createRadialGradient(
      cardCanvas.width / 2,
      cardCanvas.height / 2,
      cardCanvas.width / 8,
      cardCanvas.width / 2,
      cardCanvas.height / 2,
      Math.max(cardCanvas.width, cardCanvas.height) / 1.1
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cardCanvas.width, cardCanvas.height);
    const text = msgEl.value || '';
    if (!text) return;
    try {
      drawTextOnCanvas(text);
    } catch (err) {
      canvasStatus.textContent = `Render error: ${err.message}`;
      return;
    }
  }

  // mouse/touch handling for dragging text
  function posInCanvas(evt) {
    const rect = cardCanvas.getBoundingClientRect();
    let clientX, clientY;
    if (evt.touches && evt.touches[0]) {
      clientX = evt.touches[0].clientX; clientY = evt.touches[0].clientY;
    } else {
      clientX = evt.clientX; clientY = evt.clientY;
    }
    return { x: (clientX - rect.left) * (cardCanvas.width / rect.width), y: (clientY - rect.top) * (cardCanvas.height / rect.height) };
  }

  function isPointOnText(px, py) {
    // rough hit test: compute text block area
    const fontSize = parseInt(fontSizeEl.value || '48', 10);
    const maxWidth = cardCanvas.width * 0.8;
    const font = `${fontSize}px sans-serif`;
    ctx.font = font;
    const lines = wrapTextLines(msgEl.value || '', maxWidth, font);
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const left = textAlignEl.value === 'left' ? textPos.x : (textAlignEl.value === 'right' ? textPos.x - maxWidth/2 : textPos.x - maxWidth/2);
    const right = left + maxWidth;
    const top = textPos.y - totalHeight/2;
    const bottom = top + totalHeight;
    // use simpler check: check if point is within a rectangle around center with width=maxWidth and height=totalHeight
    return px >= left && px <= right && py >= top && py <= bottom;
  }

  cardCanvas.addEventListener('mousedown', (e) => {
    const p = posInCanvas(e);
    if (isPointOnText(p.x, p.y)) {
      dragging = true;
      dragOffset.x = p.x - textPos.x;
      dragOffset.y = p.y - textPos.y;
      e.preventDefault();
    }
  });

  cardCanvas.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const p = posInCanvas(e);
    textPos.x = p.x - dragOffset.x;
    textPos.y = p.y - dragOffset.y;
    renderCard();
  });

  window.addEventListener('mouseup', () => { dragging = false; });

  // touch support
  cardCanvas.addEventListener('touchstart', (e) => {
    const p = posInCanvas(e);
    if (isPointOnText(p.x, p.y)) {
      dragging = true;
      dragOffset.x = p.x - textPos.x;
      dragOffset.y = p.y - textPos.y;
      e.preventDefault();
    }
  }, { passive:false });

  cardCanvas.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const p = posInCanvas(e);
    textPos.x = p.x - dragOffset.x;
    textPos.y = p.y - dragOffset.y;
    renderCard();
    e.preventDefault();
  }, { passive:false });

  window.addEventListener('touchend', () => { dragging = false; });

  // background upload (fixed: clear input so re-selecting same file still fires change)
  bgUpload.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const img = new Image();
      img.onload = () => {
        bgImage = img;
        renderCard();
        // clear the file input so selecting the same file again will trigger 'change'
        try { bgUpload.value = ''; } catch (err) { /* ignore */ }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  });

  // preset clicks
  Array.from(bgPresets.querySelectorAll('img')).forEach(img => {
    img.addEventListener('click', () => {
      const src = img.getAttribute('data-src') || img.src;
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => { bgImage = i; renderCard(); };
      i.onerror = () => { console.warn('Could not load preset image'); };
      i.src = src;
    });
  });

  // export / download
  downloadBtn.addEventListener('click', () => {
    renderCard(); // ensure latest
    const dataURL = cardCanvas.toDataURL('image/jpeg', 0.95);
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'birthday-card.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  // copy image to clipboard (may require HTTPS / localhost and browser support)
  copyImageBtn.addEventListener('click', async () => {
    try {
      renderCard();
      const dataURL = cardCanvas.toDataURL('image/png'); // PNG tends to be supported for clipboard
      const blob = await (await fetch(dataURL)).blob();
      // ClipboardItem construction
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      refineStatus.textContent = 'Image copied to clipboard';
      setTimeout(() => refineStatus.textContent = '', 2000);
    } catch (e) {
      console.error('Clipboard copy failed', e);
      alert('Copy failed. Download the image instead.');
    }
  });

  // render button (also render on demand)
  renderBtn.addEventListener('click', () => {
    renderCard();
  });

  // update card when message, font, color, or align changes
  msgEl.addEventListener('input', () => { renderCard(); });
  fontSizeEl.addEventListener('change', () => { renderCard(); });
  fontFamilyEl.addEventListener('change', () => renderCard());
  fontColorEl.addEventListener('change', () => { renderCard(); });
  textAlignEl.addEventListener('change', () => { renderCard(); });

  //
  // AI / refine logic (integrated with controls)
  //
  // the callRefineServer function keeps cooldown, sends payload etc.
  async function callRefineServer(instruction) {
    const now = Date.now();
    if (now - lastRefineTime < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - lastRefineTime)) / 1000);
      refineStatus.textContent = `Please wait ${wait}s before refining again`;
      return;
    }
    lastRefineTime = now;

    const original = msgEl.value.trim();
    if (!original) { refineStatus.textContent = 'No message to refine'; return; }

    disableButtons(true);
    refineStatus.textContent = 'Refining...';
    lastAction.textContent = 'Refining';

    try {
      const safeName = (nameEl.value || DEFAULT_NAME).trim();
      const safeAge = (() => {
        const raw = (ageEl.value || DEFAULT_AGE).toString().trim();
        const n = parseInt(raw, 10);
        return (isFinite(n) && n > 0) ? String(n) : DEFAULT_AGE;
      })();
      const safeHobby = (hobbyEl.value || DEFAULT_HOBBY).trim();

      const creativity = aiCreativityEl ? aiCreativityEl.value : 'medium';
      const map = mapCreativity(creativity);

      const payload = {
        instruction,
        original_message: original,
        name: safeName,
        age: safeAge,
        hobby: safeHobby,
        system_message: map.system,
        temperature: map.temperature,
        strict: map.strict,
        ai_creativity: creativity
      };

      const r = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let j = null;
      try { j = await r.json(); } catch (e) { /* non-json response */ j = null; }

      if (r.ok && j && j.refined) {
        msgEl.value = j.refined;
        refineStatus.textContent = 'Refined!';
        lastAction.textContent = 'Refined via AI';
        renderCard(); // auto update preview after refine
      } else if (r.status === 429) {
        refineStatus.textContent = 'Rate limit: try again later';
        lastAction.textContent = 'Rate-limited';
        console.warn('Refine 429 response:', j);
      } else {
        const serverMsg = j && (j.error || j.details) ? (j.error || JSON.stringify(j.details)) : 'Unknown server error';
        refineStatus.textContent = 'Refine failed';
        lastAction.textContent = 'Refine failed';
        console.error('Refine error:', r.status, serverMsg, j);
      }
    } catch (e) {
      refineStatus.textContent = 'Refine error (server)';
      lastAction.textContent = 'Refine error';
      console.error('Fetch error:', e);
    } finally {
      const tick = () => {
        const elapsed = Date.now() - lastRefineTime;
        const remaining = Math.ceil(Math.max(0, COOLDOWN_MS - elapsed) / 1000);
        if (remaining > 0) {
          refineStatus.textContent = `Ready in ${remaining}s`;
          setTimeout(tick, 250);
        } else {
          refineStatus.textContent = '';
          disableButtons(false);
        }
      };
      tick();
    }
  }

  // generate / reset handlers (use message textarea)
  generateBtn.addEventListener('click', () => {
    const n = (nameEl.value || DEFAULT_NAME).trim();
    const a = (() => {
      const raw = (ageEl.value || DEFAULT_AGE).toString().trim();
      const n = parseInt(raw, 10);
      return (isFinite(n) && n > 0) ? String(n) : DEFAULT_AGE;
    })();
    const h = (hobbyEl.value || DEFAULT_HOBBY).trim();
    genStatus.textContent = 'Generating...';
    msgEl.value = simpleFunnyMessage(n, a, h);
    genStatus.textContent = '';
    lastAction.textContent = 'Generated';
    const instr = buildInstruction('Improve the message.', true);
    callRefineServer(instr);
    renderCard();
  });

  resetBtn.addEventListener('click', () => {
    nameEl.value = DEFAULT_NAME;
    ageEl.value = DEFAULT_AGE;
    hobbyEl.value = DEFAULT_HOBBY;
    aiInstructionEl.value = '';
    if (aiCreativityEl) aiCreativityEl.value = 'medium';
    msgEl.value = '';
    genStatus.textContent = '';
    refineStatus.textContent = '';
    lastAction.textContent = 'Reset to defaults';
    bgImage = null;
    renderCard();
  });

  refineBtn.addEventListener('click', () => {
    const instr = buildInstruction('Improve the message', true);
    callRefineServer(instr);
  });

  shortenBtn.addEventListener('click', () => {
    const instr = buildInstruction('Make the message shorter and punchier, keep essential details.', false);
    callRefineServer(instr);
  });

  funnierBtn.addEventListener('click', () => {
    const instr = buildInstruction('Make the message funnier but friendly; tasteful humor.', false);
    callRefineServer(instr);
  });

  // ping server state
  (async function pingServer(){
    try {
      const r = await fetch('/');
      serverState.textContent = r.ok ? 'connected' : 'no';
    } catch(e) {
      serverState.textContent = 'no';
    }
  })();

  // init
  window.addEventListener('load', () => {
    nameEl.value = DEFAULT_NAME;
    ageEl.value = DEFAULT_AGE;
    hobbyEl.value = DEFAULT_HOBBY;
    aiInstructionEl.value = '';
    if (aiCreativityEl) aiCreativityEl.value = 'medium';
    msgEl.value = '';
    // initial render (wait for webfonts to load)
    textPos = { x: cardCanvas.width / 2, y: cardCanvas.height / 2 };
    (async () => {
      await document.fonts.ready;
      renderCard();
    })();
  });
})();
