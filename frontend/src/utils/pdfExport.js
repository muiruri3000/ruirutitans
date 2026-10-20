/**
 * PDF Export Utility for Ruiru Titans FC
 * Triggers official printable PDF generation for any active competition (League, Cup, Tournament).
 */

export function openCategoryFixturesResultsPDF(categoryKey, autoPrint = true) {
  if (!categoryKey) return;
  const url = `/categories/${encodeURIComponent(categoryKey)}/fixtures-results/pdf/${autoPrint ? '?auto=1' : ''}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function exportCategoryFixturesResultsPDF(category, autoPrint = true) {
  if (!category) return;
  const key = category.key || category.id;
  if (key) {
    openCategoryFixturesResultsPDF(key, autoPrint);
  }
}
