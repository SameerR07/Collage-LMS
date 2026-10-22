import { Link } from 'react-router-dom'
import { ArrowBackRounded, AutoAwesomeRounded } from '@mui/icons-material'
import { splitTitle } from '../lib/utils'

// Single-digit counts read like the login's 01 / 02 / 03 tiles.
const formatTileValue = (value) => (Number.isInteger(value) && value >= 0 && value < 10 ? `0${value}` : value)

/**
 * Login-style navy banner used at the top of every page.
 * props: icon, eyebrow, title, titleAccent, description, back {to,label}, actions (node), aside (node), tiles [{label, value, note}]
 */
export default function PageBanner({ icon: Icon = AutoAwesomeRounded, eyebrow, title, titleAccent, description, back, actions, aside, tiles, className = '' }) {
  // Pass titleAccent to choose the italic words yourself; otherwise the last word is used.
  const [head, accent] = titleAccent ? [title, titleAccent] : splitTitle(title)
  const side = aside || actions
  return (
    <section className={`page-banner ${className}`}>
      {back && <Link to={back.to} className="banner-back"><ArrowBackRounded /> {back.label}</Link>}
      <div className={`banner-main ${side ? 'has-side' : ''}`}>
        <div className="banner-copy">
          {eyebrow && <span className="banner-kicker"><Icon /> {eyebrow}</span>}
          <h2>{head && <>{head} </>}<em>{accent}</em></h2>
          {description && <p>{description}</p>}
          {aside && actions && <div className="banner-actions">{actions}</div>}
        </div>
        {side && <div className={`banner-side ${aside ? 'is-aside' : 'is-actions'}`}>{side}</div>}
      </div>
      {tiles?.length > 0 && (
        <div className="banner-tiles" style={{ '--tile-count': tiles.length }}>
          {tiles.map((tile) => (
            <div className="banner-tile" key={tile.label}>
              <strong>{formatTileValue(tile.value)}</strong>
              <span>{tile.label}</span>
              {tile.note && <small>{tile.note}</small>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
