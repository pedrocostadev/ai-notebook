import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const PDF_PATH = '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf';

async function main() {
  const loader = new PDFLoader(PDF_PATH, { parsedItemSeparator: '\n' });
  const docs = await loader.load();

  console.log('Total pages:', docs.length);
  console.log('\n=== Refined Page Number Detection ===\n');

  // O'Reilly format: "PageNum | Chapter Title" or "Chapter Title | PageNum"
  // Focus on LAST lines only (footer) to avoid footnote confusion

  const detectedNumbers = [];

  for (let pageIdx = 0; pageIdx < docs.length; pageIdx++) {
    const content = docs[pageIdx].pageContent;
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    if (lines.length < 3) continue;

    // Only check last 3 lines (footer area)
    const footerLines = lines.slice(-3);
    const footerText = footerLines.join(' ');

    let detected = null;

    // Pattern 1: "PageNum | Chapter/Section Title" (O'Reilly left page)
    const leftPageMatch = footerText.match(/^(\d{1,3})\s*\|/);
    if (leftPageMatch) {
      detected = { value: parseInt(leftPageMatch[1]), pattern: 'left-page' };
    }

    // Pattern 2: "Chapter Title | PageNum" (O'Reilly right page)
    if (!detected) {
      const rightPageMatch = footerText.match(/\|\s*(\d{1,3})\s*$/);
      if (rightPageMatch) {
        detected = { value: parseInt(rightPageMatch[1]), pattern: 'right-page' };
      }
    }

    // Pattern 3: Standalone number as very last line (common format)
    if (!detected) {
      const lastLine = lines[lines.length - 1].trim();
      if (/^\d{1,3}$/.test(lastLine)) {
        const num = parseInt(lastLine);
        // Only trust numbers > 10 to avoid footnotes
        if (num > 10) {
          detected = { value: num, pattern: 'standalone-footer' };
        }
      }
    }

    // Pattern 4: Roman numerals in footer
    if (!detected) {
      const lastLine = lines[lines.length - 1].trim();
      if (/^[ivxlc]+$/i.test(lastLine)) {
        detected = { value: lastLine.toLowerCase(), pattern: 'roman', roman: true };
      }
    }

    if (detected) {
      detectedNumbers.push({ physicalPage: pageIdx + 1, ...detected });
    }
  }

  console.log(`Detected page numbers on ${detectedNumbers.length} of ${docs.length} pages\n`);

  // Show samples
  console.log('Sample detections (first 40):');
  detectedNumbers.slice(0, 40).forEach(d => {
    const offset = d.roman ? 'roman' : (d.physicalPage - d.value);
    console.log(`  Physical ${d.physicalPage.toString().padStart(3)} → Logical ${String(d.value).padStart(4)} | offset: ${String(offset).padStart(3)} | ${d.pattern}`);
  });

  // Calculate offset from non-roman, non-edge numbers
  const reliableDetections = detectedNumbers.filter(d =>
    !d.roman &&
    typeof d.value === 'number' &&
    d.value > 20 && // Skip low numbers (might be footnotes)
    d.value < 500   // Skip unreasonably high
  );

  console.log(`\n\nReliable detections (logical page > 20): ${reliableDetections.length}`);

  const offsets = reliableDetections.map(d => d.physicalPage - d.value);
  const offsetCounts = {};
  offsets.forEach(o => { offsetCounts[o] = (offsetCounts[o] || 0) + 1; });

  console.log('\nOffset frequency (from reliable pages):');
  const sortedOffsets = Object.entries(offsetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  sortedOffsets.forEach(([offset, count]) => {
    const pct = (count / reliableDetections.length * 100).toFixed(1);
    console.log(`  Offset ${offset.padStart(3)}: ${count} pages (${pct}%)`);
  });

  // Determine best offset
  const bestOffset = parseInt(sortedOffsets[0][0]);
  console.log(`\n>>> Best offset: ${bestOffset}`);

  // Verify with some known chapters
  console.log('\n\n=== Verification with TOC chapters ===\n');

  const tocChapters = [
    { title: 'Evaluate AI Systems', tocPage: 159 },
    { title: 'Prompt Engineering', tocPage: 211 },
    { title: 'RAG and Agents', tocPage: 249 },
    { title: 'Finetuning', tocPage: 307 },
    { title: 'Dataset Engineering', tocPage: 363 },
  ];

  for (const ch of tocChapters) {
    const expectedPhysical = ch.tocPage + bestOffset;
    const detected = detectedNumbers.find(d => d.physicalPage === expectedPhysical);

    console.log(`"${ch.title}":`);
    console.log(`  TOC page: ${ch.tocPage} → Expected physical: ${expectedPhysical}`);
    if (detected) {
      console.log(`  Detected logical page at physical ${expectedPhysical}: ${detected.value}`);
      console.log(`  Match: ${detected.value === ch.tocPage ? '✓ YES' : '✗ NO'}`);
    } else {
      console.log(`  No page number detected at physical ${expectedPhysical}`);
    }

    // Check actual content
    if (expectedPhysical <= docs.length) {
      const content = docs[expectedPhysical - 1].pageContent;
      const hasTitle = content.includes(ch.title);
      console.log(`  Content contains "${ch.title}": ${hasTitle ? '✓ YES' : '✗ NO'}`);
      if (hasTitle) {
        const idx = content.indexOf(ch.title);
        console.log(`  Preview: "${content.substring(idx, idx + 60).replace(/\n/g, ' ')}..."`);
      }
    }
    console.log();
  }
}

main().catch(console.error);
