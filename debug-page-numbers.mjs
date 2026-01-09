import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const PDF_PATH = '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf';

async function main() {
  const loader = new PDFLoader(PDF_PATH, { parsedItemSeparator: '\n' });
  const docs = await loader.load();

  console.log('Total pages:', docs.length);
  console.log('\n=== Analyzing page number patterns ===\n');

  // Check first 30 pages and some middle pages
  const pagesToCheck = [
    ...Array.from({ length: 30 }, (_, i) => i),  // First 30
    69, 70, 71,  // Around chapter 2 (page 49)
    178, 179, 180, 181,  // Around chapter 4 (page 159)
    229, 230, 231, 232,  // Around chapter 5 (page 211)
  ];

  for (const pageIdx of pagesToCheck) {
    if (pageIdx >= docs.length) continue;

    const content = docs[pageIdx].pageContent;
    const lines = content.split('\n');

    // Get first 3 and last 3 non-empty lines
    const nonEmptyLines = lines.filter(l => l.trim().length > 0);
    const firstLines = nonEmptyLines.slice(0, 3);
    const lastLines = nonEmptyLines.slice(-3);

    console.log(`\n--- Physical Page ${pageIdx + 1} ---`);
    console.log('First lines:', firstLines.map(l => `"${l.substring(0, 60)}"`).join(' | '));
    console.log('Last lines:', lastLines.map(l => `"${l.substring(0, 60)}"`).join(' | '));

    // Look for standalone numbers that could be page numbers
    const pageNumPatterns = [
      /^\s*(\d{1,3})\s*$/,  // Standalone number
      /^\s*[ivxlc]+\s*$/i,  // Roman numerals
      /\|\s*(\d{1,3})\s*$/,  // Number at end after pipe
      /(\d{1,3})\s*\|\s*Chapter/i,  // Number before chapter
    ];

    for (const line of [...firstLines, ...lastLines]) {
      for (const pattern of pageNumPatterns) {
        const match = line.match(pattern);
        if (match) {
          console.log(`  >> Possible page number: "${line.trim()}"`);
        }
      }
    }
  }

  // Deeper analysis: find all standalone numbers in first/last lines
  console.log('\n\n=== Page Number Detection Summary ===\n');

  const detectedNumbers = [];

  for (let pageIdx = 0; pageIdx < docs.length; pageIdx++) {
    const content = docs[pageIdx].pageContent;
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    if (lines.length === 0) continue;

    const firstLine = lines[0].trim();
    const lastLine = lines[lines.length - 1].trim();

    // Check for standalone number or "number | text" pattern
    let detectedNum = null;

    // Pattern: standalone number at start
    if (/^\d{1,3}$/.test(firstLine)) {
      detectedNum = { position: 'first', value: parseInt(firstLine), raw: firstLine };
    }
    // Pattern: standalone number at end
    else if (/^\d{1,3}$/.test(lastLine)) {
      detectedNum = { position: 'last', value: parseInt(lastLine), raw: lastLine };
    }
    // Pattern: "159  |  Chapter 4" or similar at start
    else if (/^(\d{1,3})\s*\|/.test(firstLine)) {
      const match = firstLine.match(/^(\d{1,3})/);
      if (match) detectedNum = { position: 'first', value: parseInt(match[1]), raw: firstLine.substring(0, 30) };
    }
    // Pattern: "Chapter 4  |  159" at end
    else if (/\|\s*(\d{1,3})$/.test(lastLine)) {
      const match = lastLine.match(/(\d{1,3})$/);
      if (match) detectedNum = { position: 'last', value: parseInt(match[1]), raw: lastLine.substring(-30) };
    }
    // Roman numerals
    else if (/^[ivxlc]+$/i.test(firstLine)) {
      detectedNum = { position: 'first', value: firstLine, raw: firstLine, roman: true };
    }
    else if (/^[ivxlc]+$/i.test(lastLine)) {
      detectedNum = { position: 'last', value: lastLine, raw: lastLine, roman: true };
    }

    if (detectedNum) {
      detectedNumbers.push({ physicalPage: pageIdx + 1, ...detectedNum });
    }
  }

  console.log(`Detected page numbers on ${detectedNumbers.length} of ${docs.length} pages:\n`);

  // Show first 20 and calculate offset
  detectedNumbers.slice(0, 30).forEach(d => {
    const offset = d.roman ? 'N/A' : (d.physicalPage - d.value);
    console.log(`Physical ${d.physicalPage} → Logical ${d.value} (offset: ${offset}) [${d.position}] "${d.raw}"`);
  });

  // Calculate consistent offset
  const offsets = detectedNumbers
    .filter(d => !d.roman && typeof d.value === 'number')
    .map(d => d.physicalPage - d.value);

  if (offsets.length > 0) {
    const offsetCounts = {};
    offsets.forEach(o => { offsetCounts[o] = (offsetCounts[o] || 0) + 1; });

    console.log('\n\nOffset frequency:');
    Object.entries(offsetCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([offset, count]) => {
        console.log(`  Offset ${offset}: ${count} pages (${(count/offsets.length*100).toFixed(1)}%)`);
      });
  }
}

main().catch(console.error);
