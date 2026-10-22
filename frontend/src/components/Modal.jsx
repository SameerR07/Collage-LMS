import { useEffect, useState } from 'react'
import { AutoAwesomeRounded, CloseRounded } from '@mui/icons-material'
import { splitTitle } from '../lib/utils'

export default function Modal({ open, ...props }) {
  // The card mounts fresh on every open, so its fade-in always starts from hidden
  return open ? <ModalCard {...props} /> : null
}

function ModalCard({ title, eyebrow, description, children, onClose, width = '720px' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { const frame = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(frame) }, [])
  const [head, accent] = splitTitle(title)
  return <div className={`modal-backdrop ${visible ? 'modal-visible' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal-card" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div>{eyebrow && <span className="banner-kicker"><AutoAwesomeRounded /> {eyebrow}</span>}<h2>{head && <>{head} </>}<em>{accent}</em></h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><CloseRounded /></button></div><div className="modal-body">{children}</div></div></div>
}
