import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import ActivityTracker from './components/ActivityTracker'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import EntityPage from './pages/EntityPage'
import AddStudent from './pages/AddStudent'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Users from './pages/Users'
import Drives from './pages/Drives'
import DriveForm from './pages/DriveForm'
import DriveDetail from './pages/DriveDetail'
import Attendance from './pages/Attendance'
import AttendanceSession from './pages/AttendanceSession'
import Emails from './pages/Emails'
import ActivityLog from './pages/ActivityLog'
import StudentHome from './pages/student/StudentHome'
import StudentRegistration from './pages/student/StudentRegistration'
import StudentDrives from './pages/student/StudentDrives'
import StudentAttendance from './pages/student/StudentAttendance'
import NotFound from './pages/NotFound'
import './App.css'

// Every page below checks the signed-in role (see src/lib/roles.js).
const Protected = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>

export default function App() {
  return <ThemeProvider><AuthProvider><ToastProvider><BrowserRouter><ActivityTracker /><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/legacy" element={<Navigate to="/" replace />} />
    <Route path="/" element={<Protected><Dashboard /></Protected>} />
    <Route path="/drives" element={<Protected><Drives /></Protected>} />
    <Route path="/drives/new" element={<Protected><DriveForm /></Protected>} />
    <Route path="/drives/:id" element={<Protected><DriveDetail /></Protected>} />
    <Route path="/drives/:id/edit" element={<Protected><DriveForm /></Protected>} />
    <Route path="/attendance" element={<Protected><Attendance /></Protected>} />
    <Route path="/attendance/:id" element={<Protected><AttendanceSession /></Protected>} />
    <Route path="/emails" element={<Protected><Emails /></Protected>} />
    {/* Student portal — students only */}
    <Route path="/student" element={<Protected><StudentHome /></Protected>} />
    <Route path="/student/registration" element={<Protected><StudentRegistration /></Protected>} />
    <Route path="/student/drives" element={<Protected><StudentDrives /></Protected>} />
    <Route path="/student/attendance" element={<Protected><StudentAttendance /></Protected>} />
    <Route path="/internships" element={<Protected><EntityPage key="internships" kind="internships" /></Protected>} />
    {/* The old Placements Table is now the Table view of Placement Drives */}
    <Route path="/placements" element={<Navigate to="/drives" replace />} />
    <Route path="/visits" element={<Protected><EntityPage key="visits" kind="visits" /></Protected>} />
    <Route path="/talks" element={<Protected><EntityPage key="talks" kind="talks" /></Protected>} />
    <Route path="/students" element={<Protected><EntityPage key="students" kind="students" /></Protected>} />
    <Route path="/students/add" element={<Protected><AddStudent /></Protected>} />
    <Route path="/reports" element={<Protected><Reports /></Protected>} />
    <Route path="/users" element={<Protected><Users /></Protected>} />
    <Route path="/activity" element={<Protected><ActivityLog /></Protected>} />
    <Route path="/settings" element={<Protected><Settings /></Protected>} />
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter></ToastProvider></AuthProvider></ThemeProvider>
}
