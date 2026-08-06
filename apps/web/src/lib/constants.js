/** Extensions the API accepts for the code → PDF converter. */
export const CODE_EXTENSIONS = [
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.py', '.ipynb', '.js', '.jsx', '.mjs',
  '.ts', '.tsx', '.java', '.go', '.rs', '.rb', '.php', '.cs', '.swift', '.kt',
  '.sh', '.sql', '.html', '.css', '.json', '.yml', '.yaml', '.md', '.txt'
];

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

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
