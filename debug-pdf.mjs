import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const PDF_PATH = '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf';

async function main() {
  const loader = new PDFLoader(PDF_PATH, { parsedItemSeparator: '\n' });
  const docs = await loader.load();

  console.log('Total pages:', docs.length);

  const pages = docs.map(d => d.pageContent);
  const fullText = pages.join('\n\n');

  console.log('Total text length:', fullText.length);
  const midPoint = fullText.length / 4;
  console.log('MidPoint (25%):', midPoint);

  // Compute page boundaries like the code does
  const boundaries = [];
  let currentIdx = 0;
  for (let i = 0; i < pages.length; i++) {
    boundaries.push({
      pageNumber: i + 1,
      startIdx: currentIdx,
      endIdx: currentIdx + pages[i].length
    });
    currentIdx += pages[i].length + 2;
  }

  // Search for chapter titles using NEW logic
  const chapters = [
    'Preface',
    'Evaluate AI Systems',
    'Prompt Engineering',
    'RAG and Agents',
    'Finetuning',
    'Dataset Engineering'
  ];

  console.log('\n--- NEW LOGIC: Finding chapter positions ---');
  for (const title of chapters) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const matches = [];
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      matches.push({ index: match.index, text: match[0] });
    }

    console.log(`\n"${title}" (${matches.length} occurrences):`);

    if (matches.length > 0) {
      // NEW LOGIC: Find heading-style match after TOC (first 25%)
      let bestMatch = matches[matches.length - 1]; // Default to last
      let foundHeading = false;

      for (const m of matches) {
        if (m.index < midPoint) continue; // Skip TOC area

        const prevChars = fullText.substring(Math.max(0, m.index - 20), m.index);
        const isHeading = /\n\s*$/.test(prevChars);

        if (isHeading) {
          bestMatch = m;
          foundHeading = true;
          break;
        }
      }

      // Find page number
      let pageNum = 1;
      for (let p = 0; p < boundaries.length; p++) {
        if (bestMatch.index >= boundaries[p].startIdx && bestMatch.index < boundaries[p].endIdx) {
          pageNum = p + 1;
          break;
        }
      }

      const preview = fullText.substring(bestMatch.index, bestMatch.index + 100).replace(/\n/g, ' ');
      console.log(`  Selected: pos=${bestMatch.index}, page=${pageNum}, foundHeading=${foundHeading}`);
      console.log(`  Content: "${preview}..."`);
    }
  }
}

main().catch(console.error);
