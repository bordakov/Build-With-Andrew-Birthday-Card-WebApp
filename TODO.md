# TODO

Scope: All changes apply only to the active application located in  
`Birthday-Card-WebApp/DeepLearningAIStartedChatGPTFinished/`

This is a web application for generating funny birthday cards.  
It allows the user to input a name, age, and hobby, generate a message, refine it using AI,  
load or upload a birthday card image, customize layout and design (font, size, color, alignment),  
position the message on the card, and export the final result as text or image.

---

## 🔴 High Priority (Stability / Correctness)

### 1. Rework font validation approach
- Issue: `ALLOWED_FONTS` in JS must match HTML `<select>`
- Risk: mismatch causes runtime error and breaks rendering
- Current state: validation intentionally kept but disliked
- Action: decide on single source of truth:
  - Option A: remove validation
  - Option B: generate list dynamically from DOM
  - Option C: centralize config

---

## 🟡 Medium Priority (Behavior / UX)

### 2. Improve strict edit behavior (AI)
- Issue: AI rewrites text even when instructed not to
- Example: "remove Qapla" changes unrelated parts
- Action:
  - Use AI Creativity = None (strict mode)
  - Ensure strict system message is consistently applied
  - Consider fallback for trivial edits (non-AI)

---

### 3. Sanitize AI output
- Issue: responses sometimes wrapped in quotes or code fences
- Action:
  - Implement response sanitization in `server.py`
  - Strip surrounding quotes/backticks

---

### 4. Improve browser caching behavior
- Issue: updated JS/HTML sometimes not reflected immediately
- Action:
  - Add no-cache headers in Flask
  - OR use cache-busting query strings
  - OR rely on dev workflow (hard reload)

---

## 🟢 Low Priority (Architecture / Cleanup)

### 5. Remove duplicated font configuration
- Issue: font list defined in both HTML and JS
- Action:
  - Consolidate into one source
  - Prefer DOM-driven approach

---

### 6. Optional: Improve error handling in frontend
- Add clearer UI messages for:
  - server errors
  - rate limits
  - network failures

---

### 7. Optional: Environment handling
- Improve handling when `OPENAI_API_KEY` is missing
- Provide clearer UI feedback instead of backend failure

---

## ⚪ Future Enhancements

### 8. AI-assisted image search
- Allow selecting background images via AI

### 9. Multiple app support
- Add second app (Claude version) under same repo

### 10. Export improvements
- Improve image export quality/options