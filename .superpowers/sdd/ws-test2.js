function run(u, label, ms) {
  return new Promise((resolve) => {
    const ws = new WebSocket(u);
    const all = new Set();
    const idr = new Set();
    let opened = false;
    ws.onopen = () => { opened = true; };
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
    ws.onerror = (e) => console.log(label, 'ERR', e.message || e);
    setTimeout(() => {
      console.log(`\n=== ${label} ===`);
      console.log('opened:', opened, '| total symbols:', all.size, '| IDR symbols:', idr.size);
      console.log('IDR list:', [...idr].sort().join(', '));
      try { ws.close(); } catch (e) {}
      resolve();
    }, ms);
  });
}
(async () => {
  await run('wss://stream-cloud.tokocrypto.site/stream?streams=!miniTicker@arr', 'CLOUD stream-cloud', 15000);
  await run('wss://stream-toko.2meta.app/stream?streams=!miniTicker@arr', '2META stream-toko.2meta', 15000);
  process.exit(0);
})();
