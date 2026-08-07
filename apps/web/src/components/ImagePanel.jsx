import { useEffect, useMemo, useState } from 'react';
import Dropzone from './Dropzone';
import { SelectField, SubmitButton } from './Field';
import { IMAGE_EXTENSIONS } from '../lib/constants';

const FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG (lossless)' },
  { value: 'jpg', label: 'JPG (smaller file)' },
  { value: 'webp', label: 'WebP (smallest)' }
];

export default function ImagePanel({ onSubmit, isBusy, maxFileSizeMb }) {
  const [targetFormat, setTargetFormat] = useState('png');
  const [file, setFile] = useState(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  // Object URLs leak until revoked; tie their lifetime to the selection.
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function handleSubmit(event) {
    event.preventDefault();
    if (!file || isBusy) return;
    onSubmit({ file, targetFormat, extensions: IMAGE_EXTENSIONS });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <SelectField
        label="Convert to"
        value={targetFormat}
        onChange={setTargetFormat}
        options={FORMAT_OPTIONS}
        hint="Transparency is flattened onto white when converting to JPG."
      />

      <Dropzone
        accept={IMAGE_EXTENSIONS.join(',')}
        file={file}
        onFileSelect={setFile}
        onClear={() => setFile(null)}
        helpText={`Max ${maxFileSizeMb} MB. JPG, PNG, or WebP in.`}
      />

      {previewUrl && (
        <figure>
          <img
            src={previewUrl}
            alt="Preview of the image you selected"
            className="max-h-56 w-full rounded-xl border border-[var(--line)] bg-white object-contain dark:bg-slate-900"
          />
          <figcaption className="mt-1 text-xs text-[var(--ink-muted)]">Before conversion</figcaption>
        </figure>
      )}

      <SubmitButton disabled={!file || isBusy} busy={isBusy}>
        {isBusy ? 'Converting…' : `Convert to ${targetFormat.toUpperCase()}`}
      </SubmitButton>
    </form>
  );
}
