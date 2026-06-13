type Props = {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function NexusLogo({ size = 80, className, style }: Props) {
  // Use only the orange logo for both themes
  const src = '/nexus.svg'

  return (
    <img
      src={src}
      alt="Nexus"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', ...style }}
    />
  )
}
