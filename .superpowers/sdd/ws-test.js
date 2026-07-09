const u = 'wss://stream-cloud.tokocrypto.site/stream?streams=!miniTicker@arr';
const ws = new WebSocket(u);
const seen = new Set();
let opened = false;
ws.onopen = () => { opened = true; console.log('OPEN'); };
ws.onmessage = (ev) => {
  try {
    const wrap = JSON.parse(ev.data);
    const arr = wrap.data || [];
    for (const r of arr) {
      const s = r.s;
      if (s && s.includes('IDR')) seen.add(s);
    }
  } catch (e) {}
};
ws.onerror = (e) => console.log('WS ERROR', e.message || e);
setTimeout(() => {
  console.log('IDR symbols seen:', [...seen].slice(0, 30));
  console.log('total IDR seen:', seen.size);
  ws.close();
  process.exit(0);
}, 8000);
setTimeout(() => { if (!opened) { console.log('NEVER OPENED'); process.exit(1); } }, 5000);
