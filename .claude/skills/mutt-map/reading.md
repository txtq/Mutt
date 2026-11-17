# Reading mode

Part of the map of how Mutt is built (`CLAUDE.md`, Architecture, lists every file). Keep it current when this feature changes.

- Reading mode (`drawers.modes.reading`, offered by `books.shelf_signs`, the second mode after list mode): `mutt/books.py` says which files are books and opens EPUBs (zip + OPF) for the reader; routes are under `/api/books/<id>` (book info, `part/<path>` for one chapter or picture, `progress`, `marks`, `text` for a PDF in reading format). Per-reader tables: `book_progress`, `book_marks`; `book_texts` holds converted PDFs (gzipped JSON). An EPUB's cover is saved as its thumbnail at upload. Front end: `reading.js` (the shelf and the offer), `reader.js` (the reader; places are `<chapter>:<character>`, PDF pages `p:<n>`), `pdfbook.js` (PDF → chapters with pdf.js). Reader settings (page colour, type, size) are kept per device in localStorage.
