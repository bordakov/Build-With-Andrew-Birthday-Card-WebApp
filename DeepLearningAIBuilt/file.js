// file.js - frontend logic (clean & stable)

(() => {
  const DEFAULT_NAME = 'Jonh';
  const DEFAULT_AGE = '25';
  const DEFAULT_HOBBY = 'AI';
  const COOLDOWN_MS = 8000; // 8s between server calls

  const nameEl = document.getElementById('name');
  const ageEl = document.getElementById('age');
  const hobbyEl = document.getElementById('hobby');
  const aiInstructionEl = document.getElementById('aiInstruction');
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

  const templates = [
    (n,a,h) => `Happy ${a}th birthday, ${n}! You're now officially a classic — like vintage books, but with better stories. Keep enjoying ${h}!`,
    (n,a,h) => `${n}, ${a} looks great on you — almost as good as your ${h} skills.`,
    (n,a,h) => `Happy birthday, ${n}! At ${a} you're the perfect mix of wisdom and fun. Don't stop ${h}!`,
    (n,a,h) => `Congrats ${n}! ${a} years of awesome. If ${h} gave you points, you'd be a legend.`,
    (n,a,h) => `Cheers ${n}! ${a} years young and still making time for ${h}.`
  ];

  function simpleFunnyMessage(name, age, hobby) {
    const fn = templates[Math.floor(Math.random()*templates.length)];
    return fn(name, age, hobby);
  }

  // Insert a small tone selector after the AI instruction input (if present)
  (function addToneSelector() {
    try {
      const container = aiInstructionEl ? aiInstructionEl.parentNode : null;
      if (!container) return;
      const toneWrap = document.createElement('div');
      toneWrap.style.marginTop = '8px';
      toneWrap.innerHTML = `
      <label for="toneSelect" style="font-weight:600;display:block;margin-top:8px">Tone</label>
      <select id="toneSelect" style="padding:6px;border-radius:6px;border:1px solid #ccc">
        <option value="">(none)</option>
        <option value="Wholesome">Wholesome</option>
        <option value="Sarcastic">Sarcastic</option>
        <option value="Dad-joke">Dad-joke</option>
        <option value="Klingon">Klingon</option>
      </select>
    `;
      container.appendChild(toneWrap);
      // expose element for use in buildInstruction
      window.toneSelect = document.getElementById('toneSelect');
    } catch (e) {
      console.warn('Could not add tone selector', e);
    }
  })();

  // Build instruction: prefer tone first if specified, then user's AI instruction,
  // then the button instruction. Also limit user instruction length to 1000 chars to
  // avoid huge prompts.
  function buildInstruction(buttonInstruction) {
    const rawUser = (aiInstructionEl && aiInstructionEl.value) ? aiInstructionEl.value.trim() : '';
    const user = rawUser.slice(0, 1000); // limit length
    const tone = (window.toneSelect && window.toneSelect.value) ? window.toneSelect.value : '';
    // If the user provided tone, put it first (priority), then the user instruction, if provided,
    // then the button instruction.
    let instr = user ? `${user}. ${buttonInstruction}` : buttonInstruction;
    if (tone) instr = `${tone} style. ${instr}`;
    return instr;
  }

  let lastRefineTime = 0;
  function disableButtons(disabled) {
    [generateBtn, resetBtn, refineBtn, shortenBtn, funnierBtn].forEach(b => { if (b) b.disabled = disabled; });
  }

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
      // Ensure name/age/hobby are present and trimmed; fall back to defaults
      const safeName = (nameEl.value || DEFAULT_NAME).trim();
      const safeAge = (() => {
        const raw = (ageEl.value || DEFAULT_AGE).toString().trim();
        const n = parseInt(raw, 10);
        return (isFinite(n) && n > 0) ? String(n) : DEFAULT_AGE;
      })();
      const safeHobby = (hobbyEl.value || DEFAULT_HOBBY).trim();
      // Build payload using the safe values
      const payload = {
        instruction,
        original_message: original,
        name: safeName,
        age: safeAge,
        hobby: safeHobby
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
      } else if (r.status === 429) {
        refineStatus.textContent = 'Rate limit: try again later';
        lastAction.textContent = 'Rate-limited';
        console.warn('Refine 429 response:', j);
      } else {
        // show helpful server message when available
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
      // Start visible cooldown countdown based on lastRefineTime
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
    // auto-refine using AI
    const instr = buildInstruction('Improve the message.');
    callRefineServer(instr);
  });

  resetBtn.addEventListener('click', () => {
    nameEl.value = DEFAULT_NAME;
    ageEl.value = DEFAULT_AGE;
    hobbyEl.value = DEFAULT_HOBBY;
    aiInstructionEl.value = '';
    msgEl.value = '';
    genStatus.textContent = '';
    refineStatus.textContent = '';
    lastAction.textContent = 'Reset to defaults';
  });

  // add "Copy message" button under the textarea
  (function addCopyButton() {
    try {
      const ta = msgEl;
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy Message';
      copyBtn.className = 'secondary';
      copyBtn.style.marginLeft = '8px';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(ta.value);
          refineStatus.textContent = 'Message copied to clipboard';
          setTimeout(() => refineStatus.textContent = '', 2000);
        } catch (e) {
          console.error('Clipboard error', e);
          alert('Could not copy automatically. Select and copy manually.');
        }
      });
      // insert after the message textarea
      ta.parentNode.insertBefore(copyBtn, ta.nextSibling);
    } catch (e) { console.warn('Could not add copy button', e); }
  })();

  refineBtn.addEventListener('click', () => {
    const instr = buildInstruction('Improve the message');
    callRefineServer(instr);
  });

  shortenBtn.addEventListener('click', () => {
    const instr = 'Make the message shorter and punchier, keep essential details.';
    callRefineServer(instr);
  });

  funnierBtn.addEventListener('click', () => {
    const instr = 'Make the message funnier but friendly; tasteful humor.';
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

  // initialize defaults on load
  window.addEventListener('load', () => {
    nameEl.value = DEFAULT_NAME;
    ageEl.value = DEFAULT_AGE;
    hobbyEl.value = DEFAULT_HOBBY;
    aiInstructionEl.value = '';
    msgEl.value = '';
  });
})();
