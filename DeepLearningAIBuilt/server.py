# server.py - OpenAI proxy (updated to accept frontend-driven system/temperature/strict,
# sanitize model output, validate inputs, provide a health endpoint, set no-cache headers,
# and with debug print of the request body in call_openai)
from flask import Flask, request, jsonify, send_from_directory
import os
import requests
import time
import re
import json
from dotenv import load_dotenv

load_dotenv()
OPENAI_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')

app = Flask(__name__, static_folder='.')

if not OPENAI_KEY:
    print("Warning: OPENAI_API_KEY not set in .env", flush=True)

# Default system messages (fallback if frontend does not provide)
SYS_FRIENDLY = "You are a helpful assistant that rewrites short birthday card messages to be funny and friendly."
SYS_STRICT = ("You are an exact editor. Only perform the explicit edits requested. Do NOT paraphrase, reword, "
              "expand, or summarize the text. Preserve all wording, punctuation, spacing, and capitalization "
              "except for the requested edit. Return ONLY the final edited message text with no quotes, "
              "explanations, or extra formatting.")

# Validation limits
MAX_SYSTEM_MESSAGE_LEN = 1000  # reject overly long system messages from the frontend

def sanitize_response(text):
    """
    Clean common wrappers around model output:
    - remove surrounding ```code fences```
    - remove surrounding single backticks `...`
    - remove surrounding matching quotes "..." or '...' or smart quotes
    - trim whitespace
    """
    if not text:
        return text
    s = text.strip()

    # Remove triple backticks + optional language tag
    m = re.match(r"^```(?:\w+)?\s*([\s\S]*?)\s*```$", s, flags=re.DOTALL)
    if m:
        s = m.group(1).strip()

    # Remove single backticks around entire content
    m = re.match(r"^`(.+)`$", s, flags=re.DOTALL)
    if m:
        s = m.group(1).strip()

    # Remove surrounding matching straight or smart quotes
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1].strip()
    if (s.startswith('“') and s.endswith('”')) or (s.startswith('‘') and s.endswith('’')):
        s = s[1:-1].strip()

    return s

def call_openai(messages, max_tokens=100, temperature=0.8, retries=3):
    if not OPENAI_KEY:
        raise RuntimeError("OPENAI_API_KEY not set in .env")
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"}
    body = {"model": OPENAI_MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": temperature}

    # Debug: pretty-print the request body that will be sent to OpenAI
    try:
        print("[server] OpenAI request body:\n" + json.dumps(body, indent=2, ensure_ascii=False), flush=True)
    except Exception as e:
        print(f"[server] Could not pretty-print OpenAI request body: {e}", flush=True)

    backoff = 1.0
    for attempt in range(1, retries+1):
        resp = requests.post(url, json=body, headers=headers, timeout=30)
        if resp.status_code == 429:
            retry_after = resp.headers.get("Retry-After")
            wait = float(retry_after) if retry_after else backoff
            print(f"[server] OpenAI 429: wait {wait}s (attempt {attempt})", flush=True)
            if attempt == retries:
                resp.raise_for_status()
            time.sleep(wait)
            backoff *= 2
            continue
        resp.raise_for_status()
        j = resp.json()
        return j.get("choices", [{}])[0].get("message", {}).get("content", "")
    raise RuntimeError("OpenAI failed after retries")

# Development convenience: set no-cache headers so browsers fetch fresh files
@app.after_request
def set_no_cache(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    return send_from_directory('.', 'file.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "openai_configured": bool(OPENAI_KEY)}), 200

@app.route('/api/refine', methods=['POST'])
def refine():
    data = request.get_json() or {}
    # Instruction (built by frontend). If missing, use a sensible default.
    instruction = data.get('instruction') or 'Make this short and friendly.'
    original = data.get('original_message') or data.get('input') or ''
    name = data.get('name') or ''
    age = data.get('age') or ''
    hobby = data.get('hobby') or ''

    if not original:
        return jsonify({"error": "Missing original_message"}), 400

    # Read frontend-provided system_message / temperature / strict if available
    frontend_system = data.get('system_message')
    if isinstance(frontend_system, str) and frontend_system.strip():
        # Validate length
        if len(frontend_system) > MAX_SYSTEM_MESSAGE_LEN:
            msg = f"system_message too long (max {MAX_SYSTEM_MESSAGE_LEN} chars)"
            print(f"[server] Rejecting request: {msg}", flush=True)
            return jsonify({"error": msg}), 400
        system = frontend_system.strip()
    else:
        system = SYS_FRIENDLY

    # Prefer explicit temperature from payload if valid, else default to 0.4 (medium)
    try:
        temp_raw = data.get('temperature')
        temperature = float(temp_raw) if temp_raw is not None else 0.4
    except Exception:
        temperature = 0.4
    # Clamp to [0.0, 1.0]
    temperature = max(0.0, min(1.0, temperature))

    # If frontend indicates strict and no explicit system was provided, prefer strict system
    strict_flag = bool(data.get('strict'))
    if strict_flag and not (isinstance(frontend_system, str) and frontend_system.strip()):
        system = SYS_STRICT

    print(f"[server] refine request name={name!r} age={age!r} hobby={hobby!r} instr={instruction!r} temp={temperature} strict={strict_flag}", flush=True)

    user_content = (f"Person: {name}\nAge: {age}\nHobby: {hobby}\n\n"
                    f"Original message:\n{original}\n\n"
                    f"Instruction: {instruction}\nReturn a single short rewrite suitable for a birthday card.")

    messages = [{"role": "system", "content": system}, {"role": "user", "content": user_content}]
    try:
        out = call_openai(messages, max_tokens=200, temperature=temperature, retries=3)
        out = sanitize_response(out)
        if not out:
            print("[server] OpenAI returned empty.", flush=True)
            return jsonify({"error": "Empty response from OpenAI"}), 502
        print("[server] OpenAI success.", flush=True)
        return jsonify({"refined": out})
    except Exception as e:
        print(f"[server] Error calling OpenAI: {e}", flush=True)
        return jsonify({"error": "OpenAI request failed", "details": str(e)}), 502

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"[server] Starting server at http://127.0.0.1:{port}", flush=True)
    app.run(host='127.0.0.1', port=port)
