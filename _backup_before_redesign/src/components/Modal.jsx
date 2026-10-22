import { useEffect, useState } from 'react'
import { CloseRounded } from '@mui/icons-material'

export default function Modal({ open, title, description, children, onClose, width = '720px' }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { if (open) requestAnimationFrame(() => setVisible(true)); else setVisible(false) }, [open])
  if (!open) return null
  return <div className={`modal-backdrop ${visible ? 'modal-visible' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal-card" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><CloseRounded /></button></div><div className="modal-body">{children}</div></div></div>
}
