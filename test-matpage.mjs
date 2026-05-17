import puppeteer from 'puppeteer';

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
// Match a typical desktop browser width (user likely has wider viewport)
await p.setViewport({ width: 1440, height: 900 });
await p.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });

await p.evaluate(() => showTab('quote'));
await p.waitForSelector('#tab-quote:not(.hidden)');
await p.evaluate(() => {
  const fire = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
    else { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  fire('q-customer', 'Sofie'); fire('q-project', 'Cherry Quote');
  fire('q-notes', '19x19" cherry. Total height around 39"');
  fire('q-weight', '850'); fire('q-printtime', '132'); fire('q-qty', '1');
});
await new Promise(r => setTimeout(r, 600));
await p.evaluate(() => showCustomerPDF());
await p.waitForSelector('#modal-pdf.open');
await new Promise(r => setTimeout(r, 300));

// Apply print state (exactly as _executePrint does)
await p.evaluate(() => {
  const overlay = document.getElementById('modal-pdf');
  const modal   = overlay.querySelector('.modal');
  const footer  = overlay.querySelector('.modal-footer');
  const app     = document.querySelector('.app');
  const siblings = [...app.children].filter(el => el !== overlay);
  document.body.style.setProperty('background', '#fff', 'important');
  siblings.forEach(el => el.style.setProperty('display', 'none', 'important'));
  app.style.setProperty('display', 'block', 'important');
  app.style.setProperty('padding', '0', 'important');
  overlay.style.setProperty('position', 'static', 'important');
  overlay.style.setProperty('display', 'block', 'important');
  overlay.style.setProperty('background', '#fff', 'important');
  overlay.style.setProperty('opacity', '1', 'important');
  modal.style.setProperty('min-width', '100%', 'important');
  modal.style.setProperty('max-width', '100%', 'important');
  modal.style.setProperty('max-height', 'none', 'important');
  modal.style.setProperty('height', 'auto', 'important');
  modal.style.setProperty('overflow', 'visible', 'important');
  modal.style.setProperty('box-shadow', 'none', 'important');
  modal.style.setProperty('border', 'none', 'important');
  modal.style.setProperty('transform', 'none', 'important');
  modal.style.setProperty('padding', '0', 'important');
  modal.style.setProperty('background', '#fff', 'important');
  modal.scrollTop = 0; overlay.scrollTop = 0;
  footer.style.setProperty('display', 'none', 'important');
});

const dims = await p.evaluate(() => {
  const pdfContent = document.getElementById('pdf-content');
  const matPage = pdfContent.children[1];
  const grid = matPage.querySelector('.pdf-mat-grid');
  const matNote = matPage.querySelector('.pdf-mat-note');
  const matFooter = matPage.querySelector('.pdf-mat-footer');
  const header = matPage.querySelector('.pdf-mat-header');
  const intro = matPage.querySelector('.pdf-mat-intro');

  const cs = el => el ? { h: el.scrollHeight, top: el.offsetTop, cs: getComputedStyle(el).gap || getComputedStyle(el).padding } : null;
  return {
    matPageTotal: matPage.scrollHeight,
    matPageWidth: matPage.offsetWidth,
    header: cs(header),
    intro: cs(intro),
    grid: cs(grid),
    matNote: cs(matNote),
    matFooter: cs(matFooter),
    // A4 at 96dpi
    a4: 1123,
    overflow: matPage.scrollHeight - 1123,
    cards: grid ? [...grid.children].map((c,i) => ({ i, h: c.scrollHeight, cls: c.className })) : [],
  };
});
console.log(JSON.stringify(dims, null, 2));
await b.close();
