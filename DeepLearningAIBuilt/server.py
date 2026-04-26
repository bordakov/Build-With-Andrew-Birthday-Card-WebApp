# server.py - simple OpenAI proxy (uses OPENAI_API_KEY from .env)
from flask import Flask, request, jsonify, send_from_directory
import os, requests, time
from dotenv import load_dotenv

load_dotenv()
OPENAI_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-3.5-turbo')

app = Flask(__name__, static_folder='.')

if not OPENAI_KEY:
    print("Warning: OPENAI_API_KEY not set in .env", flush=True)

@app.route('/')
def index():
    return send_from_directory('.', 'file.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

def call_openai(messages, max_tokens=100, temperature=0.8, retries=3):
    if not OPENAI_KEY:
        raise RuntimeError("OPENAI_API_KEY not set in .env")
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"}
    body = {"model": OPENAI_MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
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

@app.route('/api/refine', methods=['POST'])
def refine():
    data = request.get_json() or {}
    instruction = data.get('instruction') or 'Make this short and friendly.'
    original = data.get('original_message') or data.get('input') or ''
    name = data.get('name') or ''
    age = data.get('age') or ''
    hobby = data.get('hobby') or ''

    if not original:
        return jsonify({"error": "Missing original_message"}), 400

    print(f"[server] refine request name={name!r} age={age!r} hobby={hobby!r} instr={instruction!r}", flush=True)

    system = "You are a helpful assistant that rewrites short birthday card messages to be funny and friendly."
    user_content = f"Person: {name}\nAge: {age}\nHobby: {hobby}\n\nOriginal message:\n{original}\n\nInstruction: {instruction}\nReturn a single short rewrite suitable for a birthday card."

    messages = [{"role":"system","content":system}, {"role":"user","content":user_content}]
    try:
        out = call_openai(messages, max_tokens=100, temperature=0.8, retries=3)
        if not out:
            print("[server] OpenAI returned empty.", flush=True)
            return jsonify({"error":"Empty response from OpenAI"}), 502
        print("[server] OpenAI success.", flush=True)
        return jsonify({"refined": out})
    except Exception as e:
        print(f"[server] Error calling OpenAI: {e}", flush=True)
        return jsonify({"error":"OpenAI request failed", "details": str(e)}), 502

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"[server] Starting server at http://127.0.0.1:{port}", flush=True)
    app.run(host='127.0.0.1', port=port)
