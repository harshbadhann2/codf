import { useEffect, useMemo, useState } from 'react';
import Dropzone from './Dropzone';
import { ModeToggle, SelectField, SubmitButton } from './Field';
import { EXTRACT_MODES, IMAGE_EXTENSIONS } from '../lib/constants';
import { extensionOf } from '../lib/files';

const SOURCES = [
  { value: 'image', label: 'From an image', extensions: IMAGE_EXTENSIONS, capability: 'imageToText' },
  { value: 'pdf', label: 'From a PDF', extensions: ['.pdf'], capability: 'pdfToText' }
];

export default function ExtractPanel({ onSubmit, isBusy, maxFileSizeMb, can, reasonFor }) {
  const [source, setSource] = useState('image');
  const [mode, setMode] = useState('auto');
  const [forceOcr, setForceOcr] = useState(false);
  const [file, setFile] = useState(null);

  const active = SOURCES.find((entry) => entry.value === source);
  const isAvailable = can(active.capability);
  const previewUrl = useMemo(
    () => (file && source === 'image' ? URL.createObjectURL(file) : ''),
    [file, source]
  );

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Dropping a PDF while "From an image" is selected is a natural mistake;
  // switch for them rather than rejecting it.
  function handleFile(picked) {
    const extension = extensionOf(picked.name);

    if (extension === '.pdf' && source !== 'pdf') setSource('pdf');
    else if (IMAGE_EXTENSIONS.includes(extension) && source !== 'image') setSource('image');

    setFile(picked);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!file || isBusy || !isAvailable) return;

    onSubmit({
      source,
      file,
      extensions: active.extensions,
      fields: { mode, ...(source === 'pdf' ? { forceOcr: String(forceOcr) } : {}) }
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <ModeToggle
        label="Where is the text?"
        value={source}
        onChange={(value) => {
          setSource(value);
          setFile(null);
        }}
        options={SOURCES.map((entry) => ({
          value: entry.value,
          label: entry.label,
          disabled: !can(entry.capability),
          title: can(entry.capability) ? undefined : reasonFor(entry.capability)
        }))}
      />

      {!isAvailable && (
        <div className="animate-pop rounded-[var(--radius-md)] border border-amber-500/35 bg-amber-500/10 p-3 text-xs">
          <p className="font-semibold text-amber-800 dark:text-amber-200">Not available right now</p>
          <p className="mt-1 leading-relaxed text-amber-800/80 dark:text-amber-200/70">
            {reasonFor(active.capability)}
          </p>
        </div>
      )}

      <SelectField
        label="Text layout"
        value={mode}
        onChange={setMode}
        options={EXTRACT_MODES}
        hint={
          mode === 'auto'
            ? 'Works out columns and blocks on its own. Right for a photographed or scanned page.'
            : mode === 'block'
              ? 'Treats everything as one block of text. Better for screenshots and cropped paragraphs.'
              : 'Treats the image as a single line. For labels, codes and captions.'
        }
      />

      {source === 'pdf' && isAvailable && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--line)] bg-[rgb(var(--surface)/0.5)] p-3">
          <input
            type="checkbox"
            checked={forceOcr}
            onChange={(event) => setForceOcr(event.target.checked)}
            className="focus-ring mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-xs leading-relaxed">
            <span className="font-semibold">Read the pages as pictures</span>
            <span className="block text-[var(--ink-faint)]">
              Normally the PDF&rsquo;s own text is copied out exactly, which is faster and perfectly accurate. Tick
              this only if that text comes out garbled.
            </span>
          </span>
        </label>
      )}

      <Dropzone
        accept={source === 'pdf' ? '.pdf' : IMAGE_EXTENSIONS.join(',')}
        file={file}
        onFileSelect={handleFile}
        onClear={() => setFile(null)}
        disabled={!isAvailable}
        helpText={
          source === 'pdf'
            ? `Max ${maxFileSizeMb} MB. Scanned pages are read with OCR automatically.`
            : `Max ${maxFileSizeMb} MB. A screenshot, photo of a page, or any picture with text in it.`
        }
      />

      {previewUrl && (
        <figure>
          <img
            src={previewUrl}
            alt="Preview of the image you selected"
            className="max-h-48 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-white object-contain dark:bg-slate-900"
          />
          <figcaption className="mt-1 text-xs text-[var(--ink-faint)]">Text will be read from this</figcaption>
        </figure>
      )}

      <SubmitButton disabled={!file || isBusy || !isAvailable} busy={isBusy}>
        {isBusy ? 'Reading…' : 'Extract text'}
      </SubmitButton>

      <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
        Recognition is best on straight, sharp, well-lit text. Handwriting is not supported.
      </p>
    </form>
  );
}
