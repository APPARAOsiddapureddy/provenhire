import * as pdfjsLib from 'pdfjs-dist';

// Set worker source to match the installed pdfjs-dist version (5.x)
// Using legacy build for better compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.530/build/pdf.worker.min.mjs`;

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
    }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item: any) => 'str' in item)
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    const extractedText = fullText.trim();
    console.log('PDF extracted text preview:', extractedText.substring(0, 500));
    
    if (!extractedText || extractedText.length < 50) {
      console.warn('PDF text extraction returned minimal content, may be a scanned PDF');
    }
    
    return extractedText;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF. Please ensure the file is a valid PDF document.');
  }
}
