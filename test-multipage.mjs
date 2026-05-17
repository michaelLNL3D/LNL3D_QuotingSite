import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 900 });
await p.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
await p.evaluate(() => showTab('quote'));
await p.waitForSelector('#tab-quote:not(.hidden)');

await p.evaluate(() => {
  const fire = (id, val) => {
    const el = document.getElementById(id); if (!el) return;
    if (el.tagName === 'SELECT') { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
    else { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  fire('q-customer', 'Sofie'); fire('q-project','Cherry Quote');
  fire('q-notes','19x19" cherry. Total height around 39"');
  fire('q-weight','850'); fire('q-printtime','132'); fire('q-qty','1');
});
await new Promise(r => setTimeout(r, 600));
await p.evaluate(() => showCustomerPDF());
await p.waitForSelector('#modal-pdf.open');
await new Promise(r => setTimeout(r, 300));

// Inspect: what page builders fire? How many .pdf-doc children?
const inspect1 = await p.evaluate(() => {
  const c = document.getElementById('pdf-content');
  return {
    childCount: c.children.length,
    classes: [...c.children].map(el => el.className),
    toggleProc: document.getElementById('pdf-toggle-process')?.checked,
    togglePost: document.getElementById('pdf-toggle-postprocess')?.checked,
    toggleMat:  document.getElementById('pdf-toggle-materials')?.checked,
  };
});
console.log('After open (all on):', inspect1);

// Generate PDF in default state (4 pages expected)
async function applyPrint() {
  await p.evaluate(() => {
    const overlay = document.getElementById('modal-pdf');
    const modal = overlay.querySelector('.modal');
    const footer = overlay.querySelector('.modal-footer');
    const app = document.querySelector('.app');
    const siblings = [...app.children].filter(el => el !== overlay);
    document.body.style.setProperty('background', '#fff', 'important');
    siblings.forEach(el => el.style.setProperty('display', 'none', 'important'));
    app.style.setProperty('display', 'block', 'important');
    app.style.setProperty('padding', '0', 'important');
    overlay.style.setProperty('position','static','important');
    overlay.style.setProperty('display','block','important');
    overlay.style.setProperty('background','#fff','important');
    overlay.style.setProperty('opacity','1','important');
    modal.style.setProperty('min-width','100%','important');
    modal.style.setProperty('max-width','100%','important');
    modal.style.setProperty('max-height','none','important');
    modal.style.setProperty('height','auto','important');
    modal.style.setProperty('overflow','visible','important');
    modal.style.setProperty('box-shadow','none','important');
    modal.style.setProperty('padding','0','important');
    modal.scrollTop = 0; overlay.scrollTop = 0;
    footer.style.setProperty('display','none','important');
  });
}

await applyPrint();
let pdfBytes = await p.pdf({ format: 'A4', printBackground: true, margin: {top:0,right:0,bottom:0,left:0} });
writeFileSync('test-allon.pdf', pdfBytes);
console.log(`All-on PDF: ${(pdfBytes.length/1024).toFixed(0)}KB`);

// Now uncheck all 3 toggles → should produce 1 page (just the quote)
await p.evaluate(() => {
  // Restore styles so toggle change handler can re-render
  const overlay = document.getElementById('modal-pdf');
  const modal = overlay.querySelector('.modal');
  const footer = overlay.querySelector('.modal-footer');
  const app = document.querySelector('.app');
  document.body.style.removeProperty('background');
  [...app.children].forEach(el => el.style.removeProperty('display'));
  app.style.removeProperty('display'); app.style.removeProperty('padding');
  ['position','display','background','opacity'].forEach(p => overlay.style.removeProperty(p));
  ['min-width','max-width','max-height','height','overflow','box-shadow','padding'].forEach(p => modal.style.removeProperty(p));
  footer.style.removeProperty('display');
  // Toggle off
  document.getElementById('pdf-toggle-process').checked = false;
  document.getElementById('pdf-toggle-postprocess').checked = false;
  document.getElementById('pdf-toggle-materials').checked = false;
  onPdfToggleChange();
});
await new Promise(r => setTimeout(r, 200));
const inspect2 = await p.evaluate(() => {
  const c = document.getElementById('pdf-content');
  return { childCount: c.children.length, classes: [...c.children].map(el => el.className) };
});
console.log('After uncheck all:', inspect2);

await applyPrint();
pdfBytes = await p.pdf({ format: 'A4', printBackground: true, margin: {top:0,right:0,bottom:0,left:0} });
writeFileSync('test-quoteonly.pdf', pdfBytes);
console.log(`Quote-only PDF: ${(pdfBytes.length/1024).toFixed(0)}KB`);

await b.close();
