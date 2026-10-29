// pdf.js, fetched from the CDN the first time a PDF needs drawing.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168';

let loading;
export function loadPdfjs() {
  loading ||= import(`${PDFJS}/pdf.min.mjs`).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
    return lib;
  });
  return loading;
}
