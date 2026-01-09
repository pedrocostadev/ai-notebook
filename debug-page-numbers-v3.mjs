import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const PDF_PATH = '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf';

async function main() {
  const loader = new PDFLoader(PDF_PATH, { parsedItemSeparator: '\n' });
  const docs = await loader.load();

  // Check specific pages around "Evaluate AI Systems" (TOC says page 159)
  console.log('=== Pages around "Evaluate AI Systems" ===\n');

  for (let p = 177; p <= 183; p++) {
    const content = docs[p - 1].pageContent;
    const lines = content.split('\n').filter(l => l.trim());
    const footer = lines.slice(-3).join(' | ');
    const header = lines.slice(0, 2).join(' | ');

    // Extract page number from footer
    let pageNum = null;
    const leftMatch = footer.match(/^(\d{1,3})\s*\|/);
    const rightMatch = footer.match(/\|\s*(\d{1,3})\s*$/);
    if (leftMatch) pageNum = leftMatch[1];
    else if (rightMatch) pageNum = rightMatch[1];

    console.log(`Physical ${p}:`);
    console.log(`  Footer: "${footer.substring(0, 70)}..."`);
    console.log(`  Detected page#: ${pageNum || 'none'}`);
    console.log(`  Header: "${header.substring(0, 70)}..."`);

    if (content.includes('Evaluate AI Systems')) {
      const idx = content.indexOf('Evaluate AI Systems');
      console.log(`  >>> Contains "Evaluate AI Systems" at char ${idx}`);
    }
    console.log();
  }

  // Now test a smarter offset detection algorithm
  console.log('\n=== Smart Offset Detection ===\n');

  // Build a map of physical page → logical page (from footer)
  const pageMap = new Map();

  for (let p = 0; p < docs.length; p++) {
    const content = docs[p].pageContent;
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 3) continue;

    const footer = lines.slice(-3).join(' ');

    // O'Reilly patterns
    const leftMatch = footer.match(/^(\d{1,3})\s*\|/);
    const rightMatch = footer.match(/\|\s*(\d{1,3})\s*$/);

    let logicalPage = null;
    if (leftMatch) logicalPage = parseInt(leftMatch[1]);
    else if (rightMatch) logicalPage = parseInt(rightMatch[1]);

    if (logicalPage && logicalPage > 0) {
      pageMap.set(p + 1, logicalPage);
    }
  }

  console.log(`Built page map with ${pageMap.size} entries`);

  // Find offset using consecutive pages
  // If page N has logical L, and page N+1 has logical L+1, that's reliable
  let reliableOffsets = [];

  const physicalPages = [...pageMap.keys()].sort((a, b) => a - b);
  for (let i = 0; i < physicalPages.length - 1; i++) {
    const p1 = physicalPages[i];
    const p2 = physicalPages[i + 1];

    if (p2 === p1 + 1) {
      const l1 = pageMap.get(p1);
      const l2 = pageMap.get(p2);

      if (l2 === l1 + 1) {
        // Consecutive physical pages with consecutive logical pages!
        const offset = p1 - l1;
        reliableOffsets.push({ physical: p1, logical: l1, offset });
      }
    }
  }

  console.log(`Found ${reliableOffsets.length} reliable offset samples`);

  // Count offsets
  const offsetCounts = {};
  reliableOffsets.forEach(r => {
    offsetCounts[r.offset] = (offsetCounts[r.offset] || 0) + 1;
  });

  console.log('\nOffset distribution from consecutive pages:');
  Object.entries(offsetCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([off, count]) => {
      console.log(`  Offset ${off}: ${count} samples`);
    });

  // The most common offset from consecutive pages is most reliable
  const bestOffset = parseInt(Object.entries(offsetCounts).sort((a, b) => b[1] - a[1])[0][0]);
  console.log(`\n>>> Most reliable offset: ${bestOffset}`);

  // Now use this offset to find chapters
  console.log('\n\n=== Finding Chapters with Reliable Offset ===\n');

  const tocChapters = [
    { title: 'Evaluate AI Systems', tocPage: 159 },
    { title: 'Prompt Engineering', tocPage: 211 },
    { title: 'RAG and Agents', tocPage: 249 },
    { title: 'Finetuning', tocPage: 307 },
    { title: 'Dataset Engineering', tocPage: 363 },
    { title: 'Inference Optimization', tocPage: 405 },
  ];

  for (const ch of tocChapters) {
    const expectedPhysical = ch.tocPage + bestOffset;

    // Search in a small window
    let found = false;
    for (let p = expectedPhysical - 2; p <= expectedPhysical + 2; p++) {
      if (p < 1 || p > docs.length) continue;

      const content = docs[p - 1].pageContent;
      const lines = content.split('\n').filter(l => l.trim());
      const firstLines = lines.slice(0, 5).join(' ');

      if (firstLines.includes(ch.title)) {
        console.log(`"${ch.title}":`);
        console.log(`  TOC: ${ch.tocPage} → Expected: ${expectedPhysical} → Found at: ${p}`);
        console.log(`  Preview: "${firstLines.substring(0, 80).replace(/\n/g, ' ')}..."`);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log(`"${ch.title}":`);
      console.log(`  TOC: ${ch.tocPage} → Expected: ${expectedPhysical} → NOT FOUND in window`);
    }
    console.log();
  }
}

main().catch(console.error);
