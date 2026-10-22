import {
  ApartmentRounded,
  AssignmentRounded,
  GroupsRounded,
  HandshakeRounded,
  InsertChartRounded,
  LocalLibraryRounded,
  SchoolRounded,
  PersonAddAlt1Rounded,
  WorkRounded,
  TourRounded,
} from '@mui/icons-material'

export const moduleCards = [
  { key: 'internships', title: 'Internship Coordinator', description: 'Track internship partners, roles, seats and student activity.', icon: WorkRounded, color: 'orange', route: '/internships' },
  { key: 'placements', title: 'Placement Coordinator', description: 'Manage placement drives, companies, eligibility and outcomes.', icon: AssignmentRounded, color: 'blue', route: '/placements' },
  { key: 'visits', title: 'Industrial Visit', description: 'Plan company visits, faculty coordinators and student groups.', icon: ApartmentRounded, color: 'purple', route: '/visits' },
  { key: 'talks', title: 'Industry / Alumni Talk', description: 'Schedule expert sessions and keep alumni engagement records.', icon: HandshakeRounded, color: 'green', route: '/talks' },
  { key: 'students', title: 'Master Data', description: 'Search and manage student records from one clean workspace.', icon: LocalLibraryRounded, color: 'teal', route: '/students' },
  { key: 'add-student', title: 'Add Student Data', description: 'Create a complete student profile in under a minute.', icon: PersonAddAlt1Rounded, color: 'pink', route: '/students/add' },
]

export const sideNav = [
  { label: 'Overview', route: '/', icon: SchoolRounded },
  { label: 'Internships', route: '/internships', icon: WorkRounded },
  { label: 'Placements', route: '/placements', icon: AssignmentRounded },
  { label: 'Industrial Visits', route: '/visits', icon: TourRounded },
  { label: 'Industry & Alumni', route: '/talks', icon: GroupsRounded },
  { label: 'Master Data', route: '/students', icon: LocalLibraryRounded },
  { label: 'Add Student', route: '/students/add', icon: PersonAddAlt1Rounded },
  { label: 'Reports', route: '/reports', icon: InsertChartRounded },
]

export const entityConfigs = {
  internships: {
    title: 'Internship Coordinator', eyebrow: 'Career learning', description: 'Keep every internship opportunity organised, searchable and current.', singular: 'Internship', icon: WorkRounded, collection: 'internships',
    searchKeys: ['company', 'role', 'status'],
    fields: [
      { key: 'company', label: 'Company', required: true, placeholder: 'e.g. Alpha IT Pvt. Ltd.' },
      { key: 'role', label: 'Role', required: true, placeholder: 'e.g. MERN Stack Intern' },
      { key: 'duration', label: 'Duration', required: true, placeholder: 'e.g. 6 months' },
      { key: 'startDate', label: 'Start date', type: 'date', required: true },
      { key: 'seats', label: 'Seats', type: 'number', required: true, placeholder: '10' },
      { key: 'stipend', label: 'Stipend', placeholder: 'e.g. ₹8,000 / month' },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Upcoming', 'Closed'], required: true },
    ],
    columns: [
      { key: 'company', label: 'Company' }, { key: 'role', label: 'Role' }, { key: 'duration', label: 'Duration' }, { key: 'startDate', label: 'Start date', format: 'date' }, { key: 'seats', label: 'Seats' }, { key: 'status', label: 'Status', format: 'status' },
    ],
  },
  placements: {
    title: 'Placement Coordinator', eyebrow: 'Placement drives', description: 'Manage employer drives, roles, packages and eligibility in one view.', singular: 'Placement Drive', icon: AssignmentRounded, collection: 'placements',
    searchKeys: ['company', 'role', 'eligible', 'status'],
    fields: [
      { key: 'company', label: 'Company', required: true, placeholder: 'e.g. TechNova Solutions' },
      { key: 'driveDate', label: 'Drive date', type: 'date', required: true },
      { key: 'role', label: 'Role', required: true, placeholder: 'e.g. Graduate Engineer Trainee' },
      { key: 'ctc', label: 'CTC', required: true, placeholder: 'e.g. ₹6.2 LPA' },
      { key: 'eligible', label: 'Eligible courses', required: true, placeholder: 'e.g. BCA, BBA' },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Scheduled', 'Closed'], required: true },
    ],
    columns: [
      { key: 'company', label: 'Company' }, { key: 'role', label: 'Role' }, { key: 'driveDate', label: 'Drive date', format: 'date' }, { key: 'ctc', label: 'CTC' }, { key: 'eligible', label: 'Eligible' }, { key: 'status', label: 'Status', format: 'status' },
    ],
  },
  visits: {
    title: 'Industrial Visits', eyebrow: 'Exposure & visits', description: 'Coordinate industry visits with a clear view of people, places and dates.', singular: 'Industrial Visit', icon: TourRounded, collection: 'visits',
    searchKeys: ['organization', 'location', 'faculty', 'status'],
    fields: [
      { key: 'organization', label: 'Organization', required: true, placeholder: 'e.g. Infosys Chandigarh' },
      { key: 'date', label: 'Visit date', type: 'date', required: true },
      { key: 'location', label: 'Location', required: true, placeholder: 'e.g. Chandigarh' },
      { key: 'faculty', label: 'Faculty coordinator', required: true, placeholder: 'e.g. Dr. Aneet Bedi' },
      { key: 'students', label: 'Students', type: 'number', required: true, placeholder: '40' },
      { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Completed', 'Cancelled'], required: true },
    ],
    columns: [
      { key: 'organization', label: 'Organization' }, { key: 'date', label: 'Visit date', format: 'date' }, { key: 'location', label: 'Location' }, { key: 'faculty', label: 'Faculty' }, { key: 'students', label: 'Students' }, { key: 'status', label: 'Status', format: 'status' },
    ],
  },
  talks: {
    title: 'Industry / Alumni Talk', eyebrow: 'Community & experts', description: 'Plan expert sessions and alumni touchpoints that students remember.', singular: 'Talk / Session', icon: HandshakeRounded, collection: 'talks',
    searchKeys: ['speaker', 'organization', 'topic', 'mode', 'status'],
    fields: [
      { key: 'speaker', label: 'Speaker', required: true, placeholder: 'e.g. Rohit Malhotra' },
      { key: 'organization', label: 'Organization', required: true, placeholder: 'e.g. Microsoft Partner Network' },
      { key: 'date', label: 'Session date', type: 'date', required: true },
      { key: 'topic', label: 'Topic', required: true, placeholder: 'e.g. AI-ready careers for freshers' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['Offline', 'Online', 'Hybrid'], required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Scheduled', 'Draft', 'Completed'], required: true },
    ],
    columns: [
      { key: 'speaker', label: 'Speaker' }, { key: 'organization', label: 'Organization' }, { key: 'date', label: 'Date', format: 'date' }, { key: 'topic', label: 'Topic' }, { key: 'mode', label: 'Mode' }, { key: 'status', label: 'Status', format: 'status' },
    ],
  },
  students: {
    title: 'Master Data', eyebrow: 'Student database', description: 'The single source of truth for student placement and career data.', singular: 'Student', icon: LocalLibraryRounded, collection: 'students',
    searchKeys: ['name', 'rollNo', 'course', 'batch', 'email', 'placementStatus', 'company'],
    fields: [
      { key: 'name', label: 'Full name', required: true, placeholder: 'e.g. Simran Kaur' },
      { key: 'rollNo', label: 'Roll number', required: true, placeholder: 'e.g. BCA23026' },
      { key: 'course', label: 'Course', type: 'select', options: ['BCA', 'BBA', 'MBA', 'MCA'], required: true },
      { key: 'batch', label: 'Batch', required: true, placeholder: 'e.g. 2023-26' },
      { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'student@example.com' },
      { key: 'phone', label: 'Phone', required: true, placeholder: '10-digit mobile' },
      { key: 'cgpa', label: 'CGPA', type: 'number', step: '0.1', placeholder: '8.2' },
      { key: 'placementStatus', label: 'Placement status', type: 'select', options: ['Eligible', 'In Process', 'Placed', 'Not Eligible'], required: true },
      { key: 'company', label: 'Company (optional)', placeholder: 'e.g. TechNova' },
    ],
    columns: [
      { key: 'name', label: 'Student' }, { key: 'rollNo', label: 'Roll No.' }, { key: 'course', label: 'Course' }, { key: 'batch', label: 'Batch' }, { key: 'email', label: 'Email' }, { key: 'placementStatus', label: 'Status', format: 'status' },
    ],
  },
}
