import { useId } from 'react';

export function HeroMotion() {
  const gradient = useId();
  return <div className="hero-motion">
    <svg className="hero-motion__art" viewBox="0 0 480 480" fill="none" aria-hidden="true">
      <defs><radialGradient id={gradient}><stop stopColor="#242424"/><stop offset="1" stopColor="#101010"/></radialGradient></defs>
      <rect width="480" height="480" fill={'url(#' + gradient + ')'}/>
      <circle cx="240" cy="240" r="182" stroke="#444" strokeWidth="2" strokeDasharray="1 27"/>
      <g className="motion-stack">
        {Array.from({ length: 10 }, (_, index) => <g key={index} className="motion-sheet" style={{ '--angle': ((index - 4.5) * 6) + 'deg', '--offset': ((index - 4.5) * 8) + 'px' }}>
          <rect x="171" y="143" width="138" height="184" rx="3" fill="#161616" stroke={index === 9 ? '#ddd' : '#666'} strokeWidth="1"/>
          {index === 9 && <g stroke="#ccc" strokeWidth="1.5" strokeLinecap="round">
            <path d="m210 181-12 12 12 12m28-24 12 12-12 12m-11-27-9 30"/>
            <path d="M193 243h94m-94 13h94m-94 13h94m-94 13h68"/>
          </g>}
        </g>)}
      </g>
    </svg>
    <span className="hero-motion__caption">LOTUS / DIGITAL WORKSPACE</span>
    {/* <span className="hero-motion__label">Из файла — в результат.</span> */}
  </div>;
}
