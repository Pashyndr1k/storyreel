import { useEffect, useRef, useState } from 'react';
import { Chevron } from './icons.jsx';

// Glass pill dropdown. options: [{ value, label }]. `icon` renders before the label.
export default function Dropdown({ value, options, onChange, icon, pill, title, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = options.find((o) => o.value === value) || options[0];

  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        className={`glass-btn dd-trigger ${pill ? 'pill' : ''}`}
        title={title}
        aria-label={ariaLabel || title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        <span className="dd-label">{current?.label}</span>
        <Chevron size={13} className="dd-chevron" />
      </button>
      {open && (
        <div className="dd-menu" role="listbox">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`dd-item ${o.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
