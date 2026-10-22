export const seedData = {
  students: [
    { name: 'Aarav Sharma', rollNo: 'BCA23017', course: 'BCA', batch: '2023-26', email: 'aarav.sharma@demo.edu', phone: '9876501201', placementStatus: 'Placed', company: 'TechNova', cgpa: '8.3' },
    { name: 'Simran Kaur', rollNo: 'BCA23026', course: 'BCA', batch: '2023-26', email: 'simran.kaur@demo.edu', phone: '9876501216', placementStatus: 'Eligible', company: '', cgpa: '8.1' },
    { name: 'Riya Verma', rollNo: 'BBA23011', course: 'BBA', batch: '2023-26', email: 'riya.verma@demo.edu', phone: '9876501240', placementStatus: 'In Process', company: 'BrightWorks', cgpa: '7.8' },
    { name: 'Karan Singh', rollNo: 'BCA23031', course: 'BCA', batch: '2023-26', email: 'karan.singh@demo.edu', phone: '9876501255', placementStatus: 'Not Eligible', company: '', cgpa: '5.9' },
    { name: 'Mehak Arora', rollNo: 'BBA24007', course: 'BBA', batch: '2024-27', email: 'mehak.arora@demo.edu', phone: '9876501292', placementStatus: 'Eligible', company: '', cgpa: '8.6' },
  ],
  internships: [
    { company: 'Alpha IT Pvt. Ltd.', role: 'MERN Stack Intern', duration: '6 months', startDate: '2026-07-01', seats: '12', stipend: '₹8,000 / month', status: 'Active' },
    { company: 'BrightWorks Digital', role: 'Frontend Developer Intern', duration: '3 months', startDate: '2026-10-10', seats: '8', stipend: '₹6,000 / month', status: 'Upcoming' },
    { company: 'NorthPeak Systems', role: 'QA Automation Intern', duration: '4 months', startDate: '2026-11-03', seats: '5', stipend: '₹7,500 / month', status: 'Upcoming' },
  ],
  placements: [
    { company: 'TechNova Solutions', driveDate: '2026-10-08', role: 'Graduate Engineer Trainee', ctc: '₹6.2 LPA', eligible: 'BCA, BBA', status: 'Open' },
    { company: 'FinEdge Services', driveDate: '2026-10-13', role: 'Business Analyst Trainee', ctc: '₹5.1 LPA', eligible: 'BBA, BCA', status: 'Open' },
    { company: 'CloudMint Technologies', driveDate: '2026-09-25', role: 'Junior Web Developer', ctc: '₹4.8 LPA', eligible: 'BCA', status: 'Closed' },
  ],
  visits: [
    { organization: 'Infosys Chandigarh', date: '2026-10-22', location: 'Chandigarh', faculty: 'Dr. Aneet Bedi', students: '48', status: 'Planned' },
    { organization: 'STPI Mohali', date: '2026-11-05', location: 'Mohali', faculty: 'Ms. Neha Sharma', students: '36', status: 'Planned' },
  ],
  talks: [
    { speaker: 'Rohit Malhotra', organization: 'Microsoft Partner Network', date: '2026-10-15', topic: 'AI-ready careers for freshers', mode: 'Hybrid', status: 'Scheduled' },
    { speaker: 'Pallavi Bansal', organization: 'Alumni • Class of 2020', date: '2026-10-29', topic: 'From campus to first job', mode: 'Offline', status: 'Draft' },
  ],
}
