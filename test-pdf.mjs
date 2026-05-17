import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });

// Navigate to quote tab and fill with Sofie-style data
await p.evaluate(() => showTab('quote'));
await p.waitForSelector('#tab-quote:not(.hidden)');

await p.evaluate(() => {
  const fire = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  fire('q-customer', 'Sofie');
  fire('q-project',  'Cherry Quote');
  fire('q-notes',    '19x19" cherry. Total height around 39"');
  fire('q-weight',   '850');
  fire('q-printtime','132');
  fire('q-qty',      '1');
});

await new Promise(r => setTimeout(r, 600));

// Open preview
await p.evaluate(() => showCustomerPDF());
await p.waitForSelector('#modal-pdf.open');
await new Promise(r => setTimeout(r, 300));

// Apply the same print state _executePrint uses
await p.evaluate(() => {
  const overlay  = document.getElementById('modal-pdf');
  const modal    = overlay.querySelector('.modal');
  const footer   = overlay.querySelector('.modal-footer');
  const app      = document.querySelector('.app');
  const siblings = [...app.children].filter(el => el !== overlay);

  document.body.style.setProperty('background', '#fff', 'important');
  siblings.forEach(el => el.style.setProperty('display', 'none', 'important'));
  app.style.setProperty('display', 'block', 'important');
  app.style.setProperty('padding', '0',     'important');
  overlay.style.setProperty('position',   'static', 'important');
  overlay.style.setProperty('display',    'block',  'important');
  overlay.style.setProperty('background', '#fff',   'important');
  overlay.style.setProperty('opacity',    '1',      'important');
  modal.style.setProperty('min-width',  '100%',    'important');
  modal.style.setProperty('max-width',  '100%',    'important');
  modal.style.setProperty('max-height', 'none',    'important');
  modal.style.setProperty('height',     'auto',    'important');
  modal.style.setProperty('overflow',   'visible', 'important');
  modal.style.setProperty('box-shadow', 'none',    'important');
  modal.style.setProperty('border',     'none',    'important');
  modal.style.setProperty('transform',  'none',    'important');
  modal.style.setProperty('padding',    '0',       'important');
  modal.style.setProperty('background', '#fff',    'important');
  modal.scrollTop   = 0;
  overlay.scrollTop = 0;
  footer.style.setProperty('display', 'none', 'important');
});

const fs = await import('fs');
const pdfBytes = await p.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
});
writeFileSync('test-output.pdf', pdfBytes);
console.log(`PDF saved — ${(pdfBytes.length/1024).toFixed(0)}KB`);
await b.close();
