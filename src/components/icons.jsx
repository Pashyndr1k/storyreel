// Lucide-style inline icons used across the violet redesign.
// Inherit color via currentColor; size defaults to 20 but is overridable.
const S = ({ size = 20, sw = 1.7, children, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

export const Clapperboard = (p) => (
  <S {...p}>
    <rect x="2" y="7" width="20" height="14" rx="2.5" />
    <path d="M2 11h20" />
    <path d="M6 7 4.4 11" />
    <path d="M11 7 9.4 11" />
    <path d="M16 7l-1.6 4" />
  </S>
);

export const Grid = (p) => (
  <S {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </S>
);

export const Search = (p) => (
  <S {...p} sw={1.8}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </S>
);

export const Layers = (p) => (
  <S {...p}>
    <path d="M12 2 3 7v10l9 5 9-5V7z" />
    <path d="M12 22V12M3 7l9 5 9-5" />
  </S>
);

export const Settings = (p) => (
  <S {...p} sw={1.6}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
    <circle cx="9" cy="7" r="2.2" fill="var(--frame-bg)" />
    <circle cx="15" cy="12" r="2.2" fill="var(--frame-bg)" />
    <circle cx="8" cy="17" r="2.2" fill="var(--frame-bg)" />
  </S>
);

export const Globe = (p) => (
  <S {...p} sw={1.6}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
  </S>
);

export const Chevron = (p) => (
  <S {...p} sw={1.8}>
    <path d="m6 9 6 6 6-6" />
  </S>
);

export const Plus = (p) => (
  <S {...p} sw={2}>
    <path d="M12 5v14M5 12h14" />
  </S>
);

export const Upload = (p) => (
  <S {...p} sw={1.6}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </S>
);

export const Copy = (p) => (
  <S {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </S>
);

export const Archive = (p) => (
  <S {...p} sw={1.6}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </S>
);

export const Trash = (p) => (
  <S {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </S>
);

export const RestoreIcon = (p) => (
  <S {...p} sw={1.7}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </S>
);

export const ArrowLeft = (p) => (
  <S {...p} sw={1.8}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </S>
);

export const Download = (p) => (
  <S {...p} sw={1.6}>
    <path d="M12 4v12" />
    <path d="m7 11 5 5 5-5" />
    <path d="M4 20h16" />
  </S>
);

export const Sliders = (p) => (
  <S {...p} sw={1.7}>
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="4" y1="16" x2="20" y2="16" />
    <circle cx="9" cy="8" r="2.4" fill="var(--panel)" />
    <circle cx="15" cy="16" r="2.4" fill="var(--panel)" />
  </S>
);

export const Mic = (p) => (
  <S {...p} sw={1.7}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    <line x1="12" y1="18" x2="12" y2="22" />
  </S>
);

export const Wand = (p) => (
  <S {...p} sw={1.7}>
    <path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    <path d="M6 12l.8 1.6L8.4 14l-1.6.8L6 16.4l-.8-1.6L3.6 14l1.6-.4z" />
    <path d="M13 11 20 18" />
    <path d="m11 13 2-2" />
  </S>
);

export const Cog = (p) => (
  <S {...p} sw={1.6}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </S>
);
