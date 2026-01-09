import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const PDF_PATH = '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf';

// Actual TOC from book (pages 7-11): title + logical page number from TOC
const TOC_CHAPTERS = [
  { title: 'Preface', pageNumber: 11 },  // xi in Roman = 11
  { title: 'Introduction to Building AI Applications with Foundation Models', pageNumber: 1 },
  { title: 'Understanding Foundation Models', pageNumber: 49 },
  { title: 'Evaluate AI Systems', pageNumber: 159 },
  { title: 'Prompt Engineering', pageNumber: 211 },
  { title: 'RAG and Agents', pageNumber: 249 },  // Chapter 6
  { title: 'Finetuning', pageNumber: 307 },
  { title: 'Dataset Engineering', pageNumber: 363 },  // Chapter 8
  { title: 'Inference Optimization', pageNumber: 405 },
  { title: 'AI Engineering Architecture and User Feedback', pageNumber: 449 }
];

async function main() {
  const loader = new PDFLoader(PDF_PATH, { parsedItemSeparator: '\n' });
  const docs = await loader.load();

  console.log('Total pages:', docs.length);

  const pages = docs.map(d => d.pageContent);
  const fullText = pages.join('\n\n');

  console.log('Total text length:', fullText.length);

  // Compute page boundaries
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

  // Step 1: Detect page offset using unique chapters
  let pageOffset = 0;
  const tocArea = fullText.length / 5;

  console.log('\n--- STEP 1: Detecting page offset ---');
  console.log(`TOC area threshold (first 20%): ${tocArea} chars`);

  for (const chapter of TOC_CHAPTERS) {
    const escaped = chapter.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    const matches = [];
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      matches.push(match.index);
    }

    console.log(`\n"${chapter.title.substring(0, 40)}..." (${matches.length} occurrences)`);

    // Only use chapters with 2-10 occurrences for offset detection
    if (matches.length >= 2 && matches.length <= 10) {
      for (const pos of matches) {
        if (pos < tocArea) {
          console.log(`  Skip pos ${pos} - in TOC area`);
          continue;
        }

        const prevChars = fullText.substring(Math.max(0, pos - 10), pos);
        if (/\n\s*$/.test(prevChars)) {
          // Found heading - calculate page
          let actualPageIdx = 0;
          for (let i = 0; i < boundaries.length; i++) {
            if (pos >= boundaries[i].startIdx && pos < boundaries[i].endIdx) {
              actualPageIdx = i;
              break;
            }
          }
          const tocPageIdx = chapter.pageNumber - 1;
          pageOffset = actualPageIdx - tocPageIdx;
          console.log(`  ✓ Found heading at position ${pos}, physical page ${actualPageIdx + 1}`);
          console.log(`  TOC says logical page ${chapter.pageNumber}`);
          console.log(`  OFFSET = ${actualPageIdx + 1} - ${chapter.pageNumber} = ${pageOffset + 1}`);
          break;
        } else {
          console.log(`  Skip pos ${pos} - not at line start`);
        }
      }
      if (pageOffset !== 0) break;
    }
  }

  // If still 0, try to find any chapter heading
  if (pageOffset === 0) {
    console.log('\n>>> No offset detected from unique chapters, trying broader search...');

    // Try "Evaluate AI Systems" specifically - fairly unique
    const evalTitle = 'Evaluate AI Systems';
    const escaped = evalTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\n)\\s*${escaped}`, 'gi');
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      if (match.index < tocArea) continue;

      const prefixLen = match[0].indexOf(evalTitle);
      const titlePos = match.index + prefixLen;

      let actualPageIdx = 0;
      for (let i = 0; i < boundaries.length; i++) {
        if (titlePos >= boundaries[i].startIdx && titlePos < boundaries[i].endIdx) {
          actualPageIdx = i;
          break;
        }
      }

      // TOC says page 159
      const tocPageIdx = 159 - 1;
      pageOffset = actualPageIdx - tocPageIdx;
      console.log(`Found "Evaluate AI Systems" at physical page ${actualPageIdx + 1}`);
      console.log(`TOC says page 159, offset = ${pageOffset + 1}`);
      break;
    }
  }

  console.log(`\n>>> Final page offset: ${pageOffset} (add ${pageOffset} to TOC page to get physical page)`);

  // Step 2: Find each chapter using offset + window search
  console.log('\n--- STEP 2: Finding chapters with offset ---');

  const results = [];

  for (const chapter of TOC_CHAPTERS) {
    const tocPageIdx = chapter.pageNumber - 1;
    const expectedPageIdx = Math.min(Math.max(0, tocPageIdx + pageOffset), boundaries.length - 1);
    const expectedStart = boundaries[expectedPageIdx]?.startIdx ?? 0;
    const searchWindowStart = Math.max(0, expectedStart - 5000);
    const searchWindowEnd = Math.min(fullText.length, expectedStart + 20000);

    const escaped = chapter.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const windowText = fullText.substring(searchWindowStart, searchWindowEnd);
    const headingRegex = new RegExp(`(?:^|\\n)\\s*${escaped}`, 'i');
    const headingMatch = windowText.match(headingRegex);

    let startIdx;
    let foundMethod;
    if (headingMatch && headingMatch.index !== undefined) {
      const prefixLength = headingMatch[0].length - chapter.title.length;
      startIdx = searchWindowStart + headingMatch.index + prefixLength;
      foundMethod = 'heading in window';
    } else {
      startIdx = expectedStart;
      foundMethod = 'page boundary fallback';
    }

    // Calculate actual page
    let actualPage = 1;
    for (let p = 0; p < boundaries.length; p++) {
      if (startIdx >= boundaries[p].startIdx && startIdx < boundaries[p].endIdx) {
        actualPage = p + 1;
        break;
      }
    }

    results.push({ chapter, startIdx, actualPage, foundMethod });

    const preview = fullText.substring(startIdx, startIdx + 60).replace(/\n/g, ' ');
    console.log(`\n"${chapter.title.substring(0, 50)}${chapter.title.length > 50 ? '...' : ''}":`);
    console.log(`  TOC page: ${chapter.pageNumber} → Expected physical: ${expectedPageIdx + 1} → Actual: ${actualPage}`);
    console.log(`  Method: ${foundMethod}`);
    console.log(`  Content: "${preview}..."`);
  }

  // Verify ordering
  console.log('\n--- VERIFICATION: Chapter order by position ---');
  const sorted = [...results].sort((a, b) => a.startIdx - b.startIdx);
  sorted.forEach((r, i) => {
    console.log(`${i + 1}. ${r.chapter.title.substring(0, 40)}... (page ${r.actualPage}, pos ${r.startIdx})`);
  });
}

main().catch(console.error);
