import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

// Copy of the detectPageOffset function
function detectPageOffset(pages) {
  if (pages.length < 10) return 0;

  const midPoint = Math.floor(pages.length / 2);
  const sampleIndices = [midPoint - 2, midPoint - 1, midPoint, midPoint + 1];

  const patterns = [
    // "X of Y" - space separated (common after PDF extraction)
    { regex: /(\d{1,3})\s+of\s*\d+/i, location: 'footer', name: 'num of Y (footer)' },
    { regex: /(\d{1,3})\s+of\s*\d+/i, location: 'header', name: 'num of Y (header)' },
    // "X of Y" with pipes
    { regex: /\|\s*(\d{1,3})\s*\|\s*of\s*\d+/i, location: 'footer', name: '| num | of Y (footer)' },
    { regex: /(\d{1,3})\s*\|\s*of\s*\d+/i, location: 'footer', name: 'num | of Y (footer)' },
    { regex: /\|\s*(\d{1,3})\s*\|\s*of\s*\d+/i, location: 'header', name: '| num | of Y (header)' },
    { regex: /(\d{1,3})\s*\|\s*of\s*\d+/i, location: 'header', name: 'num | of Y (header)' },
    // O'Reilly style
    { regex: /^(\d{1,3})\s*\|/, location: 'footer', name: 'num | text (footer)' },
    { regex: /\|\s*(\d{1,3})\s*$/, location: 'footer', name: 'text | num (footer)' },
    { regex: /^(\d{1,3})\s*\|/, location: 'header', name: 'num | text (header)' },
    { regex: /\|\s*(\d{1,3})\s*$/, location: 'header', name: 'text | num (header)' },
    // Standalone
    { regex: /^(\d{1,3})$/, location: 'footer', name: 'standalone (footer)' },
    { regex: /^(\d{1,3})$/, location: 'header', name: 'standalone (header)' }
  ];

  for (const physicalIdx of sampleIndices) {
    if (physicalIdx < 0 || physicalIdx >= pages.length) continue;

    const content = pages[physicalIdx];
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 4) continue;

    const headerText = lines.slice(0, 2).join(' ');
    const footerText = lines.slice(-3).join(' ');

    for (const pattern of patterns) {
      const text = pattern.location === 'header' ? headerText : footerText;
      const match = text.match(pattern.regex);

      if (match) {
        const logicalPage = parseInt(match[1], 10);
        if (logicalPage > 0 && logicalPage < pages.length) {
          const physicalPage = physicalIdx + 1;
          const offset = physicalPage - logicalPage;
          if (offset >= 0 && offset < 100) {
            return { offset, physicalPage, logicalPage, pattern: pattern.name, text: text.substring(0, 50) };
          }
        }
      }
    }
  }

  return { offset: 0, pattern: 'none detected' };
}

async function testPdf(pdfPath, name) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));

  try {
    const loader = new PDFLoader(pdfPath, { parsedItemSeparator: '\n' });
    const docs = await loader.load();
    const pages = docs.map(d => d.pageContent);

    console.log(`Total pages: ${pages.length}`);
    console.log(`Middle point: page ${Math.floor(pages.length / 2)}`);

    const result = detectPageOffset(pages);
    console.log(`\nOffset detection:`);
    console.log(`  Pattern: ${result.pattern}`);
    if (result.offset !== undefined) {
      console.log(`  Physical page: ${result.physicalPage}`);
      console.log(`  Logical page: ${result.logicalPage}`);
      console.log(`  Offset: ${result.offset}`);
      if (result.text) console.log(`  Text: "${result.text}..."`);
    }

    // Show sample pages from middle to understand structure
    console.log(`\nSample middle pages structure:`);
    const mid = Math.floor(pages.length / 2);
    for (let i = mid - 1; i <= mid + 1; i++) {
      if (i < 0 || i >= pages.length) continue;
      const content = pages[i];
      const lines = content.split('\n').filter(l => l.trim());
      const header = lines.slice(0, 2).join(' | ');
      const footer = lines.slice(-3).join(' | ');
      console.log(`\n  Page ${i + 1}:`);
      console.log(`    Header: "${header.substring(0, 60)}..."`);
      console.log(`    Footer: "${footer.substring(0, 60)}..."`);
    }

    // Show first few pages to understand TOC structure
    console.log(`\nFirst pages (looking for TOC):`);
    for (let i = 0; i < Math.min(8, pages.length); i++) {
      const content = pages[i];
      const preview = content.substring(0, 150).replace(/\n/g, ' ');
      console.log(`  Page ${i + 1}: "${preview.substring(0, 80)}..."`);
    }

  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

async function main() {
  const pdfs = [
    { path: '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf', name: 'AI Engineering (O\'Reilly)' },
    { path: '/Users/pedrocosta/repos/ai-notebook/pdfs/book_senior_mindset.pdf', name: 'Senior Mindset' },
    { path: '/Users/pedrocosta/repos/ai-notebook/pdfs/serverless_handbook.pdf', name: 'Serverless Handbook' },
  ];

  for (const pdf of pdfs) {
    await testPdf(pdf.path, pdf.name);
  }
}

main().catch(console.error);
