import { useId } from 'react';
export function Art({
  kind,
  color,
  name,
  safe = false,
  small = false,
}: {
  kind: string;
  color: string;
  name: string;
  safe?: boolean;
  small?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  return (
    <div
      className={`art art-${kind} ${small ? 'art-small' : ''}`}
      style={{ '--art-color': color } as React.CSSProperties}
    >
      {safe ? (
        <span className="initials">
          {name
            .split(/\s+/)
            .map((x) => x[0])
            .slice(0, 2)
            .join('')}
        </span>
      ) : (
        <svg viewBox="0 0 240 300" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={id} x2=".6" y2="1">
              <stop stopColor={color} stopOpacity=".65" />
              <stop offset="1" stopColor="#11121c" />
            </linearGradient>
            <radialGradient id={`${id}g`}>
              <stop stopColor={color} stopOpacity=".5" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="240" height="300" fill={`url(#${id})`} />
          <circle cx="140" cy="130" r="130" fill={`url(#${id}g)`} />
          {kind === 'blocks' ? (
            <g transform="translate(0 25)">
              {[0, 1, 2, 3, 4].map((n) => (
                <g key={n} transform={`translate(${n * 46 - 20} ${150 - (n % 3) * 35})`}>
                  <path d="M0 0 35-20 70 0 35 20Z" fill="#9dbd68" />
                  <path d="M0 0 35 20V95L0 75Z" fill="#36513c" />
                  <path d="M35 20 70 0V75L35 95Z" fill="#65794c" />
                  <path d="M0 0 35 20V32L0 12Z" fill="#578d49" />
                </g>
              ))}
              <rect x="105" y="80" width="20" height="20" fill="#c6eda0" opacity=".7" />
            </g>
          ) : kind === 'chat' ? (
            <g fill="none" stroke={color} strokeWidth="3">
              <rect x="40" y="60" width="140" height="90" rx="25" />
              <path d="M70 150V177L100 150" />
              <rect x="80" y="135" width="130" height="90" rx="25" opacity=".4" />
              <path d="M101 225 145 244V225" opacity=".4" />
              <path d="M68 96H145M68 115H127" strokeWidth="7" />
              <circle cx="175" cy="195" r="5" fill={color} />
            </g>
          ) : kind === 'valor' ? (
            <g>
              <path d="M40 90 138 53 100 168Z" fill="#ff8d9f" />
              <path d="M115 145 203 109 176 225 88 240Z" fill="#ffd2da" opacity=".75" />
              <path d="M10 250 240 30M0 290 200 50" stroke="#fc6f88" opacity=".25" />
            </g>
          ) : kind === 'forest' || kind === 'ghost' ? (
            <g>
              <circle cx="146" cy="95" r="40" fill={color} opacity=".45" />
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <path
                  key={n}
                  d={`M${n * 42 - 5} 270V${60 + (n % 3) * 20}l-24 43 24-12 24 27-24-52`}
                  stroke="#111d24"
                  strokeWidth="9"
                  fill="none"
                />
              ))}
              {kind === 'ghost' && (
                <path d="M90 195v-50a30 30 0 0 1 60 0v50l-15-12-15 12-15-12Z" fill="#d8ece6" opacity=".7" />
              )}
            </g>
          ) : kind === 'castle' ? (
            <g fill="#26303d" stroke={color} strokeWidth="1">
              <circle cx="120" cy="110" r="67" fill="none" strokeWidth="2" />
              <path d="M50 250V150H70V90L85 60 100 90V150H140V90L155 60 170 90V150H190V250Z" />
              <path d="M105 250v-55a15 15 0 0 1 30 0v55" fill={color} opacity=".8" />
            </g>
          ) : kind === 'silk' ? (
            <g fill="none" stroke="#eac6d0">
              <path d="M0 30 240 280M240 0 0 280M120 0V300M0 155H240" opacity=".25" />
              {[40, 70, 100].map((n) => (
                <circle key={n} cx="120" cy="145" r={n} opacity=".23" />
              ))}
              <path d="M65 190Q170 60 185 145T75 245M40 145Q130 220 175 65" strokeWidth="5" opacity=".8" />
              <circle cx="126" cy="143" r="14" fill="#f3d5de" stroke="none" />
              <circle cx="126" cy="143" r="26" strokeWidth="1" opacity=".8" />
            </g>
          ) : kind === 'radio' ? (
            <g stroke={color} fill="none" strokeWidth="4">
              <rect x="88" y="68" width="64" height="110" rx="32" />
              <path d="M71 135v17a49 49 0 0 0 98 0v-17M120 202v35M90 237h60" />
              {[92, 107, 122, 137].map((y) => (
                <path key={y} d={`M105 ${y}h30`} opacity=".7" />
              ))}
            </g>
          ) : kind === 'art' ? (
            <g>
              <circle cx="120" cy="142" r="72" fill="#f4c0d7" opacity=".5" />
              <path d="M70 210 153 62 171 73 90 225Z" fill="#342c5d" />
              <path d="M70 210 90 225 66 240Z" fill="#f4dfcc" />
              <circle cx="74" cy="103" r="17" fill="#c1a5ff" />
              <circle cx="165" cy="169" r="20" fill="#ffa49e" />
            </g>
          ) : (
            <g fill="none" stroke={color}>
              <ellipse cx="120" cy="150" rx="76" ry="100" strokeWidth="2" opacity=".7" />
              <ellipse cx="120" cy="150" rx="56" ry="78" strokeWidth="9" opacity=".3" />
              <path d="M120 55 165 145 120 240 75 145Z" fill={color} opacity=".3" />
              <path d="M120 75 145 145 120 210 95 145Z" fill={color} opacity=".7" />
            </g>
          )}
          <path d="M0 300V240Q120 285 240 230V300Z" fill="#0e0e10" opacity=".35" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
            <circle
              key={n}
              cx={20 + ((n * 29) % 220)}
              cy={22 + ((n * 47) % 230)}
              r="1"
              fill="white"
              opacity=".4"
            />
          ))}
        </svg>
      )}
    </div>
  );
}
