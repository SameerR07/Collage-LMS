import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import EntityPage from './pages/EntityPage'
import AddStudent from './pages/AddStudent'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import './App.css'

const Protected = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>

export default function App() {
  return <ThemeProvider><AuthProvider><ToastProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/legacy" element={<Navigate to="/" replace />} />
    <Route path="/" element={<Protected><Dashboard /></Protected>} />
    <Route path="/internships" element={<Protected><EntityPage kind="internships" /></Protected>} />
    <Route path="/placements" element={<Protected><EntityPage kind="placements" /></Protected>} />
    <Route path="/visits" element={<Protected><EntityPage kind="visits" /></Protected>} />
    <Route path="/talks" element={<Protected><EntityPage kind="talks" /></Protected>} />
    <Route path="/students" element={<Protected><EntityPage kind="students" /></Protected>} />
    <Route path="/students/add" element={<Protected><AddStudent /></Protected>} />
    <Route path="/reports" element={<Protected><Reports /></Protected>} />
    <Route path="/settings" element={<Protected><Settings /></Protected>} />
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter></ToastProvider></AuthProvider></ThemeProvider>
}
