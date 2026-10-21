/**
 * PDF Export Utility for Ruiru Titans FC
 * Triggers official printable PDF generation for any active competition (League, Cup, Tournament).
 */

export function openCategoryFixturesResultsPDF(categoryKey, autoPrint = true) {
  if (!categoryKey) return;
  const url = `/api/categories/${encodeURIComponent(categoryKey)}/export/fixtures-results-pdf/${autoPrint ? '?auto=1' : ''}`;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function exportCategoryFixturesResultsPDF(category, autoPrint = true) {
  if (!category) return;
  const key = category.key || category.id;
  if (key) {
    openCategoryFixturesResultsPDF(key, autoPrint);
  }
}
