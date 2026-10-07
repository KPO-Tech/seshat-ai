import styles from './DocDiagram.module.css'

type DocDiagramProps = {
  eyebrow?: string
  title: string
  caption: string
  src: string
  alt: string
  wide?: boolean
}

export default function DocDiagram({
  eyebrow = 'Diagram',
  title,
  caption,
  src,
  alt,
  wide = false,
}: DocDiagramProps) {
  return (
    <figure className={`${styles.figure} ${wide ? styles.figureWide : ''}`}>
      <figcaption className={styles.meta}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <strong className={styles.title}>{title}</strong>
          <p className={styles.caption}>{caption}</p>
        </div>
        <a className={styles.link} href={src} target="_blank" rel="noreferrer">
          Open full size
        </a>
      </figcaption>

      <div className={styles.frame}>
        <img className={styles.image} src={src} alt={alt} loading="lazy" />
      </div>
    </figure>
  )
}
