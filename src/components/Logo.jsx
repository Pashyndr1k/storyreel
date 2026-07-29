// StoryReel brand mark: a film bracket facing a camera aperture.
// Geometry traced from the master artwork (assets/brand), drawn in a
// 500x366 box and filled with currentColor so it inherits the surface it sits on.
export default function Logo({ size = 26, className, title }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 366) / 500)}
      viewBox="0 0 500 366"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path fill="currentColor" d="M0 2H148V46H44V318H148V362H0Z" />
      <path
        fill="currentColor"
        d="M499 0V366L344 291L343 361H192V318L300 317V223L442 291L456 296V70L300 143V46L192 45V2H343V73L498 1Z"
      />
    </svg>
  );
}
