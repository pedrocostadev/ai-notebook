import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { readdirSync } from 'fs';
import { join } from 'path';

const PDF_DIR = '/Users/pedrocosta/repos/ai-notebook/pdfs';

async function analyzePdf(pdfPath, name) {
  console.log('\n' + '='.repeat(80));
  console.log('PDF:', name);
  console.log('='.repeat(80));

  try {
    const loader = new PDFLoader(pdfPath, { parsedItemSeparator: '\n' });
    const docs = await loader.load();

    console.log('Total pages:', docs.length);

    // Print first 5 pages to find TOC patterns
    for (let i = 0; i < Math.min(8, docs.length); i++) {
      console.log('\n--- Page ' + (i + 1) + ' ---');
      // Show first 1500 chars of each page
      console.log(docs[i].pageContent.substring(0, 1500));
    }
  } catch (err) {
    console.log('Error loading PDF:', err.message);
  }
}

async function main() {
  const files = readdirSync(PDF_DIR).filter(f => f.endsWith('.pdf'));

  for (const file of files) {
    await analyzePdf(join(PDF_DIR, file), file);
  }
}

main().catch(console.error);
