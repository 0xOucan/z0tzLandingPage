"use client"

interface BatLogoProps {
  className?: string
  size?: number
}

export function BatLogo({ className = "", size = 40 }: BatLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      aria-label="Z0tz bat logo"
    >
      {/* Bat silhouette - geometric style */}
      <path
        d="M50 20
           C45 20 40 25 38 30
           L25 25 C20 23 15 28 18 33 L30 40
           C28 45 28 50 30 55
           L15 50 C10 48 5 53 10 58 L35 65
           C38 72 44 78 50 80
           C56 78 62 72 65 65
           L90 58 C95 53 90 48 85 50 L70 55
           C72 50 72 45 70 40
           L82 33 C85 28 80 23 75 25 L62 30
           C60 25 55 20 50 20Z"
        fillRule="evenodd"
      />
      {/* Circle behind for "bat in circle" effect */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.3"
      />
    </svg>
  )
}
