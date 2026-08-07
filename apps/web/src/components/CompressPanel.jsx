import { useEffect, useMemo, useState } from 'react';
import Dropzone from './Dropzone';
import { NumberField, SelectField, SubmitButton } from './Field';
import { COMPRESS_FORMATS, COMPRESS_PRESETS, IMAGE_EXTENSIONS } from '../lib/constants';
import { formatBytes } from '../lib/files';

export default function CompressPanel({ onSubmit, isBusy, maxFileSizeMb }) {
  const [presetId, setPresetId] = useState('photo-50');
  const [form, setForm] = useState(() => {
    const preset = COMPRESS_PRESETS[0];
    return {
      minKb: preset.minKb,
      targetKb: preset.targetKb,
      width: preset.width,
      height: preset.height,
      fit: preset.fit,
      format: 'jpg'
    };
  });
  const [file, setFile] = useState(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);

  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function applyPreset(preset) {
    setPresetId(preset.id);

    // Custom keeps whatever is already typed; the others overwrite so the
    // chosen preset is honestly what gets sent.
    if (preset.id === 'custom') return;

    setForm((current) => ({
      ...current,
      minKb: preset.minKb,
      targetKb: preset.targetKb,
      width: preset.width,
      height: preset.height,
      fit: preset.fit
    }));
  }

  function update(patch) {
    setForm((current) => ({ ...current, ...patch }));
    // Editing any field by hand means the preset no longer describes the form.
    setPresetId('custom');
  }

  const targetKb = Number(form.targetKb);
  const minKb = form.minKb === '' || form.minKb === null ? null : Number(form.minKb);
  const hasDimensions = Boolean(form.width || form.height);

  const targetValid = Number.isFinite(targetKb) && targetKb >= 1 && targetKb <= maxFileSizeMb * 1024;
  const minValid = minKb === null || (Number.isFinite(minKb) && minKb >= 1 && minKb <= targetKb);
  const canSubmit = Boolean(file) && targetValid && minValid && !isBusy;
  const alreadySmaller = file && targetValid && !minKb && file.size <= targetKb * 1024 && !hasDimensions;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    onSubmit({
      file,
      extensions: IMAGE_EXTENSIONS,
      fields: {
        targetKb: String(targetKb),
        minKb: minKb ? String(minKb) : '',
        format: form.format,
        fit: form.fit,
        width: form.width ? String(form.width) : '',
        height: form.height ? String(form.height) : ''
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">What do you need?</p>
        <div className="flex flex-wrap gap-2">
          {COMPRESS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              aria-pressed={presetId === preset.id}
              className={`focus-ring rounded-[var(--radius-md)] border px-3.5 py-2.5 text-left transition-all duration-300 ${
                presetId === preset.id
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-md)]'
                  : 'border-[var(--line)] bg-[rgb(var(--surface)/0.5)] hover:-translate-y-0.5 hover:border-[var(--line-strong)]'
              }`}
            >
              <span className="block text-sm font-semibold">{preset.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">{preset.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Minimum size (KB)"
          optional
          min={1}
          max={maxFileSizeMb * 1024}
          placeholder="none"
          value={form.minKb}
          onChange={(minKb) => update({ minKb })}
          error={!minValid ? 'The minimum must be between 1 KB and the maximum.' : ''}
        />

        <NumberField
          label="Maximum size (KB)"
          min={1}
          max={maxFileSizeMb * 1024}
          value={form.targetKb}
          onChange={(targetKb) => update({ targetKb })}
          error={!targetValid ? `Enter a size between 1 and ${maxFileSizeMb * 1024} KB.` : ''}
        />
      </div>

      <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
        Many forms specify a range, like &ldquo;photo must be between 20 KB and 50 KB&rdquo;. Set the minimum and the
        result will land inside it — a file that is too small gets rejected just as surely as one that is too big.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Width (px)"
          min={16}
          max={10000}
          placeholder="auto"
          value={form.width}
          onChange={(width) => update({ width })}
        />

        <NumberField
          label="Height (px)"
          min={16}
          max={10000}
          placeholder="auto"
          value={form.height}
          onChange={(height) => update({ height })}
        />
      </div>

      <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
        Leave width and height blank to keep the original dimensions and shrink only the file size.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Output format"
          value={form.format}
          onChange={(format) => update({ format })}
          options={COMPRESS_FORMATS}
        />

        {hasDimensions && (
          <SelectField
            label="If the shape doesn't match"
            value={form.fit}
            onChange={(fit) => update({ fit })}
            options={[
              { value: 'cover', label: 'Crop to exact size' },
              { value: 'inside', label: 'Fit inside, keep whole image' }
            ]}
            hint={
              form.fit === 'cover'
                ? 'Gives exactly the pixel size asked for — edges may be trimmed.'
                : 'Keeps the whole photo; the result may be smaller than the box.'
            }
          />
        )}
      </div>

      <Dropzone
        accept={IMAGE_EXTENSIONS.join(',')}
        file={file}
        onFileSelect={setFile}
        onClear={() => setFile(null)}
        helpText={`Max ${maxFileSizeMb} MB in. JPG, PNG, or WebP.`}
      />

      {previewUrl && (
        <figure>
          <img
            src={previewUrl}
            alt="Preview of the image you selected"
            className="max-h-48 w-full rounded-xl border border-[var(--line)] bg-white object-contain dark:bg-slate-900"
          />
          <figcaption className="mt-1 text-xs text-[var(--ink-muted)]">
            Before: {formatBytes(file.size)}
          </figcaption>
        </figure>
      )}

      {alreadySmaller && (
        <p className="rounded-xl border border-[var(--line)] bg-white/60 p-3 text-xs text-[var(--ink-muted)] dark:bg-slate-900/40">
          This file is already under {targetKb} KB. Compressing it anyway will re-encode it at the best quality that
          still fits — useful if the form also rejects your current format.
        </p>
      )}

      <SubmitButton disabled={!canSubmit} busy={isBusy}>
        {isBusy
          ? 'Compressing…'
          : `Compress to ${targetValid ? (minKb ? `${minKb}–${targetKb} KB` : `${targetKb} KB`) : 'target'}`}
      </SubmitButton>
    </form>
  );
}
