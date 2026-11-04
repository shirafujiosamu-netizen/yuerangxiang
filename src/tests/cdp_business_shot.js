/* 门面视图真实浏览器截图（CDP + Edge headless）
 * 运行前：起 Edge（--remote-debugging-port=9229 --headless=new），再 node 本文件 */
const WS = require('ws');
const fs = require('fs');
const PORT = 9229;
const URL = 'file:///F:/job/oc-game/src/index.html';
const OUT = 'F:/job/oc-game/docs/shots/';
(async () => {
  await new Promise(r => setTimeout(r, 2500));
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  if (!page) { console.error('FATAL: 无 page 目标'); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
  const send = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name, Buffer.from(s.result.data, 'base64')); };
  fs.mkdirSync(OUT, { recursive: true });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 3000));
  console.log('err', await ev("window.__err || ''"));
  await ev("localStorage.clear(); 1");
  await send('Page.navigate', { url: URL });
  await new Promise(r => setTimeout(r, 3000));
  console.log('nav', await ev("Array.from(document.querySelectorAll('.nav-btn')).map(b=>b.textContent).join('|')"));
  await ev("document.querySelector('.nav-btn[data-view=business]').click(); 1");
  await new Promise(r => setTimeout(r, 600));
  await shot('01-business-list.png');
  console.log('factions', await ev("Array.from(document.querySelectorAll('.faction-card')).map(c=>c.textContent.slice(0,12)).join(' / ')"));
  await ev("document.querySelector('[data-act=faction-pick][data-id=wanren]').click(); 1");
  await new Promise(r => setTimeout(r, 500));
  await shot('02-funeral-empty.png');
  await ev("document.querySelector('[data-act=funeral-start]').click(); 1");
  await new Promise(r => setTimeout(r, 500));
  await shot('03-order.png');
  const steps = await ev("Array.from(document.querySelectorAll('.step-chip')).map(c=>c.textContent).join(' | ')");
  console.log('steps', steps);
  const ch = await ev("JSON.stringify(Array.from(document.querySelectorAll('.btn.choice')).map(b=>b.getAttribute('data-id')))");
  console.log('choices', ch);
  await ev("document.querySelector('.btn.choice').click(); 1");
  await new Promise(r => setTimeout(r, 500));
  await shot('04-step2.png');
  /* demo 尾段：赌场合作 */
  await ev("DG.ui.game.funeral.active=null; DG.ui.game.funeral.stage='eidos_ready'; DG.ui.game.bonds.eidos=1; DG.ui.view='business'; DG.ui.renderBusiness(); 1");
  await new Promise(r => setTimeout(r, 400));
  await shot('05-story-casino.png');
  await ev("document.querySelector('[data-act=story-play]').click(); 1");
  await new Promise(r => setTimeout(r, 400));
  await shot('06-deal.png');
  const deal = await ev("document.querySelector('.story-box.deal') ? document.querySelector('.story-box.deal').textContent : 'none'");
  console.log('deal', deal);
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
