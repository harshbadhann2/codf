import { apiGet, apiPostForm, apiPostJson } from './client';

export function fetchHealth(options) {
  return apiGet('/health', options);
}

export function convertCodeToPdf(payload, options) {
  return apiPostJson('/convert/code-to-pdf', payload, options);
}

function formDataFor(file, fields = {}) {
  const formData = new FormData();
  formData.append('file', file);

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, value);
    }
  });

  return formData;
}

export function convertCodeFileToPdf(file, fields, options) {
  return apiPostForm('/convert/code-file-to-pdf', formDataFor(file, fields), options);
}

export function convertDocxToPdf(file, options) {
  return apiPostForm('/convert/docx-to-pdf', formDataFor(file), options);
}

export function convertPdfToDocx(file, fields, options) {
  return apiPostForm('/convert/pdf-to-docx', formDataFor(file, fields), options);
}

export function convertImage(file, fields, options) {
  return apiPostForm('/convert/image', formDataFor(file, fields), options);
}

export function compressImage(file, fields, options) {
  return apiPostForm('/convert/image-compress', formDataFor(file, fields), options);
}
