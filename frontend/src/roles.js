// Sidebar modules per portal. `phase` = which conversion phase brings it live.
export const PORTALS = {
  // 4th value "v" = needs a validated Permanent ID (old menu-restrictions.js)
  patient: {
    title: "Patient Portal",
    modules: [
      ["Appointments", 2, "appointments"], ["Book Appointment", 3, "book-appointment"], ["Children", "2B", "children", "v"], ["Child Appointments", "2B", "child-appointments", "v"],
      ["Case Files & Past Reports", "2B", "case-files", "v"], ["Problems", 2, "problems", "v"], ["Medications", 2, "medications", "v"], ["Lab Records", 2, "lab-records", "v"],
      ["Allergies", 2, "allergies", "v"], ["Immunisations", 2, "immunisations", "v"], ["Notifications", 2, "notifications"], ["My Profile", 2, "profile"],
    ],
  },
  doctor: { title: "Doctor Portal", modules: [["Appointments", 3, "appointments"], ["Referrals", "3C", "referrals"], ["My Slots", 3, "slots"], ["My Profile", "3C", "profile"]] },
  nurse: { title: "Nurse Portal", modules: [] },
  reception: { title: "Reception", modules: [["Appointments", 3, "appointments"], ["Book Appointment", 3, "book"], ["Patient Validation", 4, "patient-validation"], ["Register Patient", 5]] },
  hospital: { title: "Hospital Portal", modules: [["Appointments", 4, "appointments"], ["Book Appointment", 4, "book"], ["Departments", 4, "departments"], ["Doctors", 4, "doctors"],
    ["Nurses", 4, "nurses"], ["Receptionists", 4, "receptionists"], ["Staff Approval", 4, "staff-approval"], ["Patient Validation", 4, "patient-validation"],
    ["Labs & Pharmacies", 4, "affiliations"], ["Hospital Profile", 4, "profile"]] },
  "internal-admin": { title: "Internal Admin", modules: [["Hospitals", 4, "hospitals"], ["Laboratories", 4, "labs"], ["Pharmacies", 4, "pharmacies"], ["My Profile", 4, "profile"]] },
  "super-admin": { title: "Super Admin", modules: [["Internal Admins", 4, "internal-admins"], ["Hospitals", 4, "hospitals"], ["Laboratories", 4, "labs"], ["Pharmacies", 4, "pharmacies"], ["All Users", 4, "users"]] },
  lab: { title: "Lab Portal", modules: [["Lab Orders", 5], ["Lab Staff", 5], ["Reports Upload", 5]] },
  "lab-staff": { title: "Lab Staff", modules: [["Assigned Orders", 5], ["Upload Reports", 5]] },
  pharmacy: { title: "Pharmacy Portal", modules: [["Medicine Orders", 5], ["Pharmacy Staff", 5], ["Inventory", 5]] },
  "pharmacy-staff": { title: "Pharmacy Staff", modules: [["Assigned Orders", 5], ["Dispense", 5]] },
};

export const STATUS_MESSAGES = {
  id_error: "We couldn't find that ID. Check it and try again.",
  password_error: "Incorrect password. 3 wrong attempts lock the account for 2 minutes.",
  locked_account: "Account temporarily locked. Please try again after 2 minutes.",
  account_inactive: "Your internal admin account is inactive. Please contact the super admin.",
  password_expired: "Your password has expired. Please reset it to continue.",
  temp_password_expired: "Your temporary password has expired. Please request a new one.",
  missing_fields: "Enter both your ID and password.",
};

// modules -> {name, phase, path|null, validated}; path means the screen is live
export const modulesOf = (portal, user) => PORTALS[portal].modules
  .filter(([, , , v]) => !(v === "v" && user && user.role === "PATIENT" && user.validated === false))
  .map(([name, phase, path]) => ({ name, phase, path: path || null }));
