import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const PDF_PATHS = [
  '/Users/pedrocosta/repos/ai-notebook/pdfs/book_senior_mindset.pdf',
  '/Users/pedrocosta/repos/ai-notebook/pdfs/book_ai_enginering.pdf',
  '/Users/pedrocosta/repos/ai-notebook/pdfs/serverless_handbook.pdf',
];

async function extractOutline(pdfPath) {
  const doc = await getDocument(pdfPath).promise;

  console.log('PDF loaded, pages:', doc.numPages);

  // Get the outline (TOC/bookmarks)
  const outline = await doc.getOutline();

  if (!outline) {
    console.log('No outline/bookmarks found in PDF');
    return;
  }

  console.log('\n=== PDF Outline ===\n');

  // Recursively print outline with hierarchy
  async function printOutline(items, level = 0) {
    for (const item of items) {
      const indent = '  '.repeat(level);

      // Get page number from destination
      let pageNum = '?';
      if (item.dest) {
        try {
          if (typeof item.dest === 'string') {
            const dest = await doc.getDestination(item.dest);
            if (dest) {
              const pageRef = dest[0];
              pageNum = await doc.getPageIndex(pageRef) + 1;
            }
          } else if (Array.isArray(item.dest)) {
            const pageRef = item.dest[0];
            pageNum = await doc.getPageIndex(pageRef) + 1;
          }
        } catch (e) {
          pageNum = 'err';
        }
      }

      console.log(`${indent}[Level ${level}] "${item.title}" -> Page ${pageNum}`);

      // Recurse into children
      if (item.items && item.items.length > 0) {
        await printOutline(item.items, level + 1);
      }
    }
  }

  await printOutline(outline);

  // Also show just level 0 items
  console.log('\n=== Level 0 Only (Main Chapters) ===\n');
  for (const item of outline) {
    let pageNum = '?';
    if (item.dest) {
      try {
        if (Array.isArray(item.dest)) {
          const pageRef = item.dest[0];
          pageNum = await doc.getPageIndex(pageRef) + 1;
        }
      } catch (e) {}
    }
    console.log(`"${item.title}" -> Page ${pageNum}`);
  }
}

async function main() {
  for (const pdfPath of PDF_PATHS) {
    console.log('\n\n' + '='.repeat(80));
    console.log('FILE:', pdfPath.split('/').pop());
    console.log('='.repeat(80));
    await extractOutline(pdfPath);
  }
}

main().catch(console.error);
