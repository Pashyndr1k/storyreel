import { useEffect } from 'react';

// Full-size media pop-up shared across the app. `item` is { kind: 'img'|'vid',
// src } or null; clicking the backdrop, the ✕ or pressing Escape closes it.
// z-index sits above modal overlays, so thumbnails inside modals work too.
export default function Lightbox({ item, onClose }) {
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, onClose]);

  if (!item) return null;
  return (
    // stopPropagation: when the pop-up lives inside another overlay (asset
    // library), closing it must not also close the host modal.
    <div
      className="lightbox"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {item.kind === 'vid' ? (
        <video src={item.src} controls autoPlay onClick={(e) => e.stopPropagation()} />
      ) : (
        <img src={item.src} alt="" onClick={(e) => e.stopPropagation()} />
      )}
      <button type="button" className="lightbox-x" aria-label="close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
