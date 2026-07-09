const u = 'wss://stream-cloud.tokocrypto.site/stream?streams=!ticker@arr';
const ws = new WebSocket(u);
const all = new Set();
const idr = new Set();
let opened = false;
ws.onopen = () => { opened = true; console.log('OPEN'); };
ws.onmessage = (ev) => {
  try {
    const wrap = JSON.parse(ev.data);
    const arr = wrap.data || [];
    for (const r of arr) {
      const s = r.s;
      if (!s) continue;
      all.add(s);
      if (s.includes('IDR')) idr.add(s);
    }
  } catch (e) {}
};
ws.onerror = (e) => console.log('WS ERR', e.message || e);
setTimeout(() => {
  console.log('opened:', opened, '| total:', all.size, '| IDR:', idr.size);
  console.log('IDR sample:', [...idr].slice(0, 12).join(', '));
  console.log('has priceChangePercent? checking one msg field keys on next...');
  ws.close();
  process.exit(0);
}, 15000);
