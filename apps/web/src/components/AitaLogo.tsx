interface AitaLogoProps {
  size?: number;
  className?: string;
}

/**
 * Official AITA-Intelligent Logo (AI Brain + AST Code Circuits)
 * Designed according to SRS Mockup 01
 */
export function AitaLogo({ size = 36, className = '' }: AitaLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="brain-gradient" x1="4" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="code-gradient" x1="22" y1="8" x2="44" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      {/* Brain left hemisphere silhouette */}
      <path
        d="M22 8C17.5 8 13.8 10 12 13.5C10 16 9.8 19 11.2 21.8C9.5 23.8 9.2 26.8 10.5 29.5C9.2 32 9.8 35.2 12 37.2C14.5 39.8 18 40 22 40"
        stroke="url(#brain-gradient)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Brain internal neural convolutions */}
      <path
        d="M15 19C17.8 19.8 19.5 21.5 21 22.5"
        stroke="url(#brain-gradient)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M13.8 27C17.2 27 19 28.5 21 30.2"
        stroke="url(#brain-gradient)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.5 34.5C18 34.8 19.5 35.5 21 35.5"
        stroke="url(#brain-gradient)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Synaptic nodes */}
      <circle cx="12" cy="15" r="1.6" fill="#38bdf8" />
      <circle cx="10" cy="24" r="1.6" fill="#3b82f6" />
      <circle cx="10.5" cy="32" r="1.6" fill="#7c3aed" />

      {/* Circuit lines with node terminals */}
      <path d="M23 14H30" stroke="url(#code-gradient)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="33" cy="14" r="2.4" stroke="url(#code-gradient)" strokeWidth="2" fill="white" />

      <path d="M23 34H30" stroke="url(#code-gradient)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="33" cy="34" r="2.4" stroke="url(#code-gradient)" strokeWidth="2" fill="white" />

      {/* Code brackets < / > */}
      <path
        d="M27 20.5L23.5 24L27 27.5"
        stroke="url(#code-gradient)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31 19.5L28.5 28.5"
        stroke="url(#code-gradient)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M32.5 20.5L36 24L32.5 27.5"
        stroke="url(#code-gradient)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
