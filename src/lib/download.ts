// Deterministic client-side downloads.
//
// Both the invoice PDF and the QR ticket are generated in the browser, so they
// must not depend on a library's internal save heuristics (which silently do
// nothing in some environments). One helper, one behaviour: object URL →
// anchor[download] → click → revoke.

/** Trigger a download for a generated Blob. No-op when called without a Blob. */
export function downloadBlob(blob: Blob | null | undefined, filename: string): boolean {
  if (!blob) return false;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

/** Serialize an inline SVG (e.g. the rendered QR code) into a downloadable Blob. */
export function svgBlob(svg: SVGSVGElement | null): Blob | null {
  if (!svg) return null;
  try {
    return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
  } catch {
    return null;
  }
}
