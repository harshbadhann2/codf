/** Extensions the API accepts for the code → PDF converter. */
export const CODE_EXTENSIONS = [
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.py', '.ipynb', '.js', '.jsx', '.mjs',
  '.ts', '.tsx', '.java', '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt',
  '.sh', '.sql', '.html', '.css', '.json', '.yml', '.yaml', '.md', '.txt'
];

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Ready-made targets for the upload rules that exam boards and admission
 * portals actually publish. These cover the overwhelming majority of "photo
 * must be under N KB" requirements; anything unusual uses Custom.
 */
export const COMPRESS_PRESETS = [
  {
    id: 'photo-20-50',
    label: 'Exam photo',
    detail: '20–50 KB · 200×230',
    minKb: 20,
    targetKb: 50,
    width: 200,
    height: 230,
    fit: 'cover'
  },
  {
    id: 'signature-10-20',
    label: 'Signature',
    detail: '10–20 KB · 140×60',
    minKb: 10,
    targetKb: 20,
    width: 140,
    height: 60,
    fit: 'cover'
  },
  {
    id: 'photo-100',
    label: 'Photo under 100 KB',
    detail: 'up to 100 KB · any size',
    minKb: '',
    targetKb: 100,
    width: '',
    height: '',
    fit: 'inside'
  },
  {
    id: 'doc-200',
    label: 'Document scan',
    detail: 'up to 200 KB · any size',
    minKb: '',
    targetKb: 200,
    width: '',
    height: '',
    fit: 'inside'
  },
  {
    id: 'custom',
    label: 'Custom',
    detail: 'Set your own',
    minKb: '',
    targetKb: 100,
    width: '',
    height: '',
    fit: 'inside'
  }
];

export const COMPRESS_FORMATS = [
  { value: 'jpg', label: 'JPG — what most forms require' },
  { value: 'png', label: 'PNG — lossless, larger' },
  { value: 'webp', label: 'WebP — smallest, less widely accepted' }
];

export const LANGUAGE_OPTIONS = [
  { value: '', label: 'Auto detect' },
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Shell' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'plaintext', label: 'Plain text' }
];

/** Accepted by the document → Markdown converter. */
export const DOCUMENT_EXTENSIONS = ['.pdf', '.docx'];

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.txt'];

export const PDF_THEMES = [
  { value: 'light', label: 'Light — white page' },
  { value: 'dark', label: 'Dark — dark page' }
];

export const PDF_PAGE_SIZES = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'US Letter' }
];

export const EXTRACT_MODES = [
  { value: 'auto', label: 'Automatic — a page or photo' },
  { value: 'block', label: 'One block — a screenshot' },
  { value: 'line', label: 'A single line' }
];
