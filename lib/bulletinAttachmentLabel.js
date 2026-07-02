export function extensionFromMaterial(material) {
  const candidates = [
    material?.filename,
    material?.storage_path,
    material?.provider_url,
    material?.title,
  ];
  for (const value of candidates) {
    if (!value || typeof value !== 'string') continue;
    const base = value.split('?')[0].split('#')[0].toLowerCase();
    const match = base.match(/\.([a-z0-9]{2,5})$/);
    if (match) return match[1];
  }
  const mime = String(material?.mime || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('msword')) return 'docx';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'pptx';
  if (mime.startsWith('image/')) return mime.split('/')[1] || 'img';
  return '';
}

export function formatAttachmentLabel(material) {
  const title = String(material?.title || material?.name || 'Attachment').trim();
  if (/\.[a-z0-9]{2,5}$/i.test(title)) return title;
  const ext = extensionFromMaterial(material);
  return ext ? `${title}.${ext}` : title;
}

export function normalizeBulletinAttachmentMaterial(material) {
  if (!material) return null;
  return {
    id: material.id,
    title: material.title || material.name || 'Attachment',
    mime: material.mime || null,
    filename: material.filename || null,
    storage_path: material.storage_path || material.storagePath || null,
    provider_url: material.provider_url || material.url || null,
  };
}
