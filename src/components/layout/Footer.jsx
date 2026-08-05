export function Footer({ onNavigate }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <a className="site-footer__brand" href="/" onClick={(event) => onNavigate(event, 'home')}>
          <img src="/lotus.svg" alt="" />
          <span>Lotus Docs</span>
        </a>
        <p>Файлы обрабатываются локально и не покидают браузер.</p>
        <nav aria-label="Контакты">
          <a href="https://t.me/itakash1" target="_blank" rel="noreferrer">Telegram</a>
          <a href="https://github.com/itakash1" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
