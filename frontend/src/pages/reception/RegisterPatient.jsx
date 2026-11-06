import { useState } from "react";
import PatientRegistration from "../../components/PatientRegistration";
import { PageHead } from "../../components/ui";

export default function RegisterPatient() {
  const [n, setN] = useState(0);
  return (<div className="stack"><PageHead title="Register patient" subtitle="Walk-in registration with mobile OTP verification" />
    <PatientRegistration key={n} desk onAnother={() => setN(n + 1)} /></div>);
}
