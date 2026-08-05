export function PageHead({ eyebrow, title, text, aside }) {
  return (
    <div className="page-head">
      <div>
        <p className="page-head__eyebrow">{eyebrow}</p>
        <h1 className="page-head__title">{title}</h1>
        <p className="page-head__text">{text}</p>
      </div>
      {aside}
    </div>
  );
}
