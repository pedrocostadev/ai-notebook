import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const PDF_PATH = '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf';

// Copy of the new detectPageOffset function for testing
function detectPageOffset(pages) {
  if (pages.length < 10) return 0;

  const midPoint = Math.floor(pages.length / 2);
  const sampleIndices = [midPoint - 2, midPoint - 1, midPoint, midPoint + 1];

  const patterns = [
    { regex: /^(\d{1,3})\s*\|/, location: 'footer' },
    { regex: /\|\s*(\d{1,3})\s*$/, location: 'footer' },
    { regex: /^(\d{1,3})\s*\|/, location: 'header' },
    { regex: /\|\s*(\d{1,3})\s*$/, location: 'header' },
    { regex: /^(\d{1,3})$/, location: 'footer' },
    { regex: /^(\d{1,3})$/, location: 'header' }
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
            console.log(`Found pattern at physical page ${physicalPage}:`);
            console.log(`  Pattern: ${pattern.regex}`);
            console.log(`  Location: ${pattern.location}`);
            console.log(`  Text: "${text.substring(0, 60)}..."`);
            console.log(`  Detected logical page: ${logicalPage}`);
            console.log(`  Calculated offset: ${offset}`);
            return offset;
          }
        }
      }
    }
  }

  return 0;
}

async function main() {
  const loader = new PDFLoader(PDF_PATH, { parsedItemSeparator: '\n' });
  const docs = await loader.load();
  const pages = docs.map(d => d.pageContent);

  console.log(`Total pages: ${pages.length}`);
  console.log(`Middle point: page ${Math.floor(pages.length / 2)}\n`);

  const offset = detectPageOffset(pages);
  console.log(`\n>>> Final offset: ${offset}\n`);

  // Verify with known chapters
  console.log('=== Verification ===\n');

  const chapters = [
    { title: 'Evaluate AI Systems', tocPage: 159 },
    { title: 'Prompt Engineering', tocPage: 211 },
    { title: 'Finetuning', tocPage: 307 },
    { title: 'Dataset Engineering', tocPage: 363 },
  ];

  for (const ch of chapters) {
    const expectedPhysical = ch.tocPage + offset;
    const pageIdx = expectedPhysical - 1;

    if (pageIdx >= 0 && pageIdx < pages.length) {
      const content = pages[pageIdx];
      const firstLines = content.split('\n').filter(l => l.trim()).slice(0, 5).join(' ');
      const hasTitle = content.includes(ch.title);

      console.log(`"${ch.title}":`);
      console.log(`  TOC: ${ch.tocPage} + offset ${offset} = physical ${expectedPhysical}`);
      console.log(`  Contains title: ${hasTitle ? '✓' : '✗'}`);
      if (hasTitle) {
        console.log(`  Preview: "${firstLines.substring(0, 70)}..."`);
      }
      console.log();
    }
  }
}

main().catch(console.error);
