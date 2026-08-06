# Bundled fonts

[JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) — Regular, Italic, Bold, and Bold Italic.

These are committed to the repository rather than resolved from the host so that a PDF generated on Render looks identical to one generated on a developer's machine. The Docker image has no user fonts installed; without these the renderer would silently fall back to Courier.

Licensed under the SIL Open Font License 1.1 — see [`OFL.txt`](OFL.txt).

To use a different monospace font instead, set the `CODE_PDF_FONT_*` environment variables to absolute `.ttf` paths (see `apps/api/.env.example`).
