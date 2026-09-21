export function FileGlyph({ format = '+', ready = false }) {
  return <span className={'file-glyph' + (ready ? ' file-glyph--ready' : '')} aria-hidden="true">
    <svg viewBox="0 0 90 112" fill="none"><path d="M12 2h43l23 23v75a10 10 0 0 1-10 10H12a10 10 0 0 1-10-10V12A10 10 0 0 1 12 2Z"/><path d="M55 2v23h23M20 70h38M20 80h30"/></svg>
    <span>{format}</span>
  </span>;
}
