interface CasaTabLogoProps {
  size?: number
  className?: string
}

export function CasaTabLogo({ size = 24, className }: CasaTabLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* House roofline */}
      <path
        d="M24 4L4 22h6v18h28V22h6L24 4z"
        fill="currentColor"
        opacity="0.1"
      />
      <path
        d="M24 4L4 22h6v18h28V22h6L24 4z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Tab/receipt lines inside the house */}
      <line x1="16" y1="27" x2="32" y2="27" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="32" x2="28" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="37" x2="24" y2="37" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
