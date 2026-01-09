import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

const PDF_PATH = '/Users/pedrocosta/repos/ai-notebook/pdfs/book_senior_mindset.pdf';

async function main() {
  const loader = new PDFLoader(PDF_PATH, { parsedItemSeparator: '\n' });
  const docs = await loader.load();

  console.log('Total pages:', docs.length);

  // Print first 10 pages to find TOC
  for (let i = 0; i < Math.min(10, docs.length); i++) {
    console.log('\n' + '='.repeat(60));
    console.log('PAGE ' + (i + 1));
    console.log('='.repeat(60));
    console.log(docs[i].pageContent);
  }
}

main().catch(console.error);
