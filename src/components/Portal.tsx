import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Render an overlay at the document root.
 *
 * PageTransition animates its wrapper (opacity), and any ancestor that keeps a
 * transform / filter / backdrop-filter creates a containing block for
 * `position: fixed`. Overlays rendered inside a page therefore collapse onto the
 * page wrapper (0-height) instead of covering the viewport — which is exactly
 * how the booking success screen and the modals used to disappear. Portalling
 * to <body> makes the overlay independent of the page shell.
 */
export default function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
