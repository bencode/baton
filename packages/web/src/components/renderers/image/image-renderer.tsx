import { useState } from 'react'
import styles from './image-renderer.module.scss'

export type ImageSize = 'fit' | 'actual'

const Picture = ({ src, alt, size }: { src: string; alt: string; size: ImageSize }) => {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <p role="alert" className={styles.error}>
      无法显示图片。
    </p>
  ) : (
    <img
      src={src}
      alt={alt}
      className={size === 'fit' ? styles.fit : styles.actual}
      onError={() => setFailed(true)}
    />
  )
}

// One image, fitted to the space or at its own size.
export const ImageRenderer = ({
  src,
  alt,
  size,
}: {
  src: string
  alt: string
  size: ImageSize
}) => (
  <div className={styles.renderer} data-size={size}>
    {/* A new src starts over, so a past load error clears. */}
    <Picture key={src} src={src} alt={alt} size={size} />
  </div>
)

export const ImageSizeToggle = ({
  value,
  onChange,
}: {
  value: ImageSize
  onChange(next: ImageSize): void
}) => (
  <button
    type="button"
    className={`ui-button ${styles.toggle}`}
    aria-pressed={value === 'actual'}
    onClick={() => onChange(value === 'actual' ? 'fit' : 'actual')}
  >
    原始大小
  </button>
)
