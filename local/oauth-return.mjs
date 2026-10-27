import { createServer } from 'node:http'

// This client-facing destination does not require a FinOps session.
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>QuickBooks Connected | Headquarters</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111c32;background:#f3f6fa}
*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px}
main{width:min(100%,520px);padding:clamp(28px,5vw,48px);border:1px solid #dce5ed;border-radius:20px;background:#fff;box-shadow:0 20px 55px rgba(17,28,50,.09)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:38px;font-size:15px;font-weight:700;color:#176e73}
.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#168a8c;color:#fff;font-size:24px;font-weight:800}
.success{display:grid;place-items:center;width:50px;height:50px;border-radius:50%;background:#e8f7ef;color:#087d59;font-size:27px;font-weight:700}
h1{margin:20px 0 12px;font-size:clamp(25px,4vw,31px);line-height:1.2;letter-spacing:-.03em}
p{margin:0;color:#4b5e75;line-height:1.65}.company{margin-top:18px;font-weight:600;color:#111c32}.next{margin-top:24px;padding-top:22px;border-top:1px solid #e5ebf1}
button{margin-top:26px;border:1px solid #cbd8e3;border-radius:10px;background:white;padding:11px 18px;font:inherit;font-weight:600;color:#111c32;cursor:pointer}button:hover{background:#f3f8f8;border-color:#168a8c}button:focus-visible{outline:3px solid #8ed5d0;outline-offset:2px}
.hint{display:none;margin-top:12px;font-size:13px}
</style></head><body><main>
<div class="brand"><span class="mark" aria-hidden="true">H</span><span>Headquarters</span></div>
<div class="success" aria-hidden="true">✓</div>
<h1>QuickBooks connected successfully</h1>
<p>Your QuickBooks authorization is complete.</p>
<p class="company" id="company" hidden></p>
<p class="next">You can safely close this window. The Headquarters team will confirm the connection on their side.</p>
<button type="button" id="close">Close window</button>
<p class="hint" id="hint">If this window does not close automatically, you can close the tab.</p>
</main><script>
const companyName = new URLSearchParams(location.search).get('company_name');
if (companyName) { const company = document.getElementById('company'); company.textContent = companyName; company.hidden = false; }
document.getElementById('close').addEventListener('click', () => { window.close(); document.getElementById('hint').style.display = 'block'; });
</script></body></html>`

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost:8080')
  if (req.method !== 'GET' || url.pathname !== '/qbo-success/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer',
  })
  res.end(page)
}).listen(8080, '0.0.0.0')
