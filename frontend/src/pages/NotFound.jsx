import { Link } from 'react-router-dom'
import { ArrowBackRounded } from '@mui/icons-material'
export default function NotFound() { return <div className="not-found"><div className="not-found-card"><span className="logo-plate"><img src="/gjimt-brand.png" alt="GJIMT" /></span><span className="not-found-code">404</span><h1>That page went off-campus.</h1><p>The route you opened does not exist in this LMS build.</p><Link to="/" className="primary-button"><ArrowBackRounded /> Back to dashboard</Link></div></div> }
