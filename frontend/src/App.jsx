import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import OtpVerify from "./pages/OtpVerify";
import Shell from "./components/Shell";
import Home from "./pages/Home";
import ComingSoon from "./pages/ComingSoon";
import Appointments, { ChildAppointments } from "./pages/patient/Appointments";
import Children from "./pages/patient/Children";
import CaseFiles from "./pages/patient/CaseFiles";
import CaseFilePage from "./pages/CaseFilePage";
import VisitPage from "./pages/doctor/visit/VisitPage";
import DoctorProfile from "./pages/doctor/DoctorProfile";
import PatientFiles from "./pages/doctor/PatientFiles";
import DoctorReferrals from "./pages/doctor/DoctorReferrals";
import Allergies from "./pages/patient/Allergies";
import Immunisations from "./pages/patient/Immunisations";
import { Problems, Medications, LabRecords } from "./pages/patient/Records";
import Notifications from "./pages/patient/Notifications";
import Profile from "./pages/patient/Profile";
import BookAppointment from "./pages/patient/BookAppointment";
import DoctorAppointments from "./pages/doctor/DoctorAppointments";
import DoctorAppointmentDetail from "./pages/doctor/DoctorAppointmentDetail";
import DoctorSlots from "./pages/doctor/DoctorSlots";
import ReceptionAppointments from "./pages/reception/ReceptionAppointments";
import ReceptionBook from "./pages/reception/ReceptionBook";
import SetPassword from "./pages/SetPassword";
import HospitalRegister from "./pages/register/HospitalRegister";
import AdminRegister from "./pages/register/AdminRegister";
import SuperAdminLogin from "./pages/superadmin/SuperAdminLogin";
import Departments from "./pages/hospital/Departments";
import Staff, { StaffApproval } from "./pages/hospital/Staff";
import Affiliations from "./pages/hospital/Affiliations";
import HospitalProfile from "./pages/hospital/HospitalProfile";
import PatientDesk from "./pages/desk/PatientDesk";
import { AdminProfile, InternalAdmins, Review, Users } from "./pages/admin/AdminPages";

function Protected({ children, roles }) {
  const { session, isTemp, isOtp, user } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (isTemp) return <Navigate to="/change-password" replace />;
  if (isOtp) return <Navigate to="/verify-otp" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

// Pages that need a validated Permanent ID (old menu-restrictions.js)
function Validated({ children }) {
  const { user } = useAuth();
  if (user.role === "PATIENT" && user.validated === false) return (
    <div className="empty"><span className="empty-icon">🔒</span><h2>Access restricted</h2>
      <p className="muted">This patient account is not validated yet. Only Dashboard, My Appointments, Book Appointment, Notifications and My Profile are available.<br />Please visit a Hospital, Laboratory, Pharmacy or Receptionist for Permanent ID validation.</p></div>);
  return children;
}

function ByRole({ map }) {
  const { user } = useAuth();
  return map[user.role] || <Navigate to="/app" replace />;
}

export default function App() {
  const { session, isTemp, isOtp } = useAuth();
  const full = session && !isTemp && !isOtp;
  return (
    <Routes>
      <Route path="/login" element={full ? <Navigate to="/app" replace /> : isOtp ? <Navigate to="/verify-otp" replace /> : <Login />} />
      <Route path="/verify-otp" element={isOtp ? <OtpVerify /> : <Navigate to={session ? "/app" : "/login"} replace />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/register/hospital" element={<HospitalRegister />} />
      <Route path="/register/internal-admin" element={<AdminRegister />} />
      <Route path="/super-admin" element={full ? <Navigate to="/app" replace /> : <SuperAdminLogin />} />
      <Route path="/change-password" element={session && !isOtp ? <ChangePassword /> : <Navigate to="/login" replace />} />
      <Route path="/app" element={<Protected><Shell /></Protected>}>
        <Route index element={<Home />} />
        <Route path="appointments" element={<ByRole map={{ PATIENT: <Appointments />, DOCTOR: <DoctorAppointments />, RECEPTIONIST: <ReceptionAppointments />, HOSPITAL: <ReceptionAppointments /> }} />} />
        <Route path="appointments/:id" element={<Protected roles={["DOCTOR"]}><DoctorAppointmentDetail /></Protected>} />
        <Route path="visit/:id" element={<Protected roles={["DOCTOR"]}><VisitPage /></Protected>} />
        <Route path="referrals" element={<Protected roles={["DOCTOR"]}><DoctorReferrals /></Protected>} />
        <Route path="patients/:pid" element={<Protected roles={["DOCTOR"]}><PatientFiles /></Protected>} />
        <Route path="case-file/:id" element={<Protected roles={["DOCTOR", "PATIENT"]}><CaseFilePage /></Protected>} />
        <Route path="children" element={<Protected roles={["PATIENT"]}><Validated><Children /></Validated></Protected>} />
        <Route path="child-appointments" element={<Protected roles={["PATIENT"]}><Validated><ChildAppointments /></Validated></Protected>} />
        <Route path="case-files" element={<Protected roles={["PATIENT"]}><Validated><CaseFiles /></Validated></Protected>} />
        <Route path="slots" element={<Protected roles={["DOCTOR"]}><DoctorSlots /></Protected>} />
        <Route path="book" element={<Protected roles={["RECEPTIONIST", "HOSPITAL"]}><ReceptionBook /></Protected>} />
        <Route path="departments" element={<Protected roles={["HOSPITAL"]}><Departments /></Protected>} />
        <Route path="doctors" element={<Protected roles={["HOSPITAL"]}><Staff key="doctor" kind="doctor" /></Protected>} />
        <Route path="nurses" element={<Protected roles={["HOSPITAL"]}><Staff key="nurse" kind="nurse" /></Protected>} />
        <Route path="receptionists" element={<Protected roles={["HOSPITAL"]}><Staff key="receptionist" kind="receptionist" /></Protected>} />
        <Route path="staff-approval" element={<Protected roles={["HOSPITAL"]}><StaffApproval /></Protected>} />
        <Route path="affiliations" element={<Protected roles={["HOSPITAL"]}><Affiliations /></Protected>} />
        <Route path="patient-validation" element={<Protected roles={["HOSPITAL", "RECEPTIONIST"]}><PatientDesk /></Protected>} />
        <Route path="hospitals" element={<Protected roles={["ADMIN", "SUPER_ADMIN"]}><Review key="hospital" kind="hospital" /></Protected>} />
        <Route path="labs" element={<Protected roles={["ADMIN", "SUPER_ADMIN"]}><Review key="lab" kind="lab" /></Protected>} />
        <Route path="pharmacies" element={<Protected roles={["ADMIN", "SUPER_ADMIN"]}><Review key="pharmacy" kind="pharmacy" /></Protected>} />
        <Route path="internal-admins" element={<Protected roles={["SUPER_ADMIN"]}><InternalAdmins /></Protected>} />
        <Route path="users" element={<Protected roles={["SUPER_ADMIN"]}><Users /></Protected>} />
        <Route path="book-appointment" element={<Protected roles={["PATIENT"]}><BookAppointment /></Protected>} />
        <Route path="problems" element={<Protected roles={["PATIENT"]}><Validated><Problems /></Validated></Protected>} />
        <Route path="medications" element={<Protected roles={["PATIENT"]}><Validated><Medications /></Validated></Protected>} />
        <Route path="lab-records" element={<Protected roles={["PATIENT"]}><Validated><LabRecords /></Validated></Protected>} />
        <Route path="allergies" element={<Protected roles={["PATIENT"]}><Validated><Allergies /></Validated></Protected>} />
        <Route path="immunisations" element={<Protected roles={["PATIENT"]}><Validated><Immunisations /></Validated></Protected>} />
        <Route path="notifications" element={<Protected roles={["PATIENT"]}><Notifications /></Protected>} />
        <Route path="profile" element={<ByRole map={{ PATIENT: <Profile />, DOCTOR: <DoctorProfile />, HOSPITAL: <HospitalProfile />, ADMIN: <AdminProfile /> }} />} />
        <Route path=":module" element={<ComingSoon />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
