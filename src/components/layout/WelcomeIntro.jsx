import { useEffect, useState } from 'react';

export function WelcomeIntro() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  useEffect(() => {
    if (!visible) return undefined;
    const dismiss = () => setVisible(false);
    const timer = window.setTimeout(dismiss, 1400);
    window.addEventListener('keydown', dismiss, { once: true });
    window.addEventListener('pointerdown', dismiss, { once: true });
    return () => { clearTimeout(timer); window.removeEventListener('keydown', dismiss); window.removeEventListener('pointerdown', dismiss); };
  }, [visible]);
  if (!visible) return null;
  return <div className="welcome-intro" aria-hidden="true" onClick={() => setVisible(false)}>
    <span className="welcome-intro__line welcome-intro__line--left" />
    <img src="/lotus.svg" width="64" height="64" alt="" />
    <span className="welcome-intro__line welcome-intro__line--right" />
  </div>;
}
