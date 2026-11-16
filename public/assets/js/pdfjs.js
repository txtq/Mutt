// pdf.js, fetched from the CDN the first time a PDF needs drawing, and pdf-lib,
// the first time one is written (a document taken away as a PDF, a PDF marked up).

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168';

let loading;
export function loadPdfjs() {
  loading ||= import(`${PDFJS}/pdf.min.mjs`).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
    return lib;
  });
  return loading;
}

const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

let pdfLib;
export function loadPdfLib() {
  pdfLib ||= new Promise((resolve, reject) => {
    if (window.PDFLib) { resolve(window.PDFLib); return; }
    const s = document.createElement('script');
    s.src = PDF_LIB;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error('The PDF maker didn’t load.')));
    s.onerror = () => { pdfLib = null; reject(new Error('The PDF maker couldn’t be fetched. Check your connection.')); };
    document.head.append(s);
  });
  return pdfLib;
}
