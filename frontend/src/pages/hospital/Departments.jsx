import { useState } from "react";
import { api } from "../../api";
import { Field, digits, useForm } from "../../components/FormKit";
import { Empty, ErrorBox, Loading, Modal, PageHead, fmtDate, useApi } from "../../components/ui";

const blank = { deptname: "", deptheadname: "", dept_head_mobile_number: "", floor_wing: "", assigneddoctors: "", assignednurses: "", noofrooms: "", noofbeds: "" };

// Legacy dept-list.html + department-register.html
export default function Departments() {
  const { data, loading, error, reload } = useApi("hospital/departments");
  const form = useForm(blank); const { f, errors, setErrors, bind, reset } = form;
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [ok, setOk] = useState("");
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const { data: r } = await api("hospital/departments", { method: "POST", body: f });
    setBusy(false);
    if (r.status === "registered") { setOpen(false); reset(); setOk(`Department registered (${r.permanentid}).`); reload(); } else setErrors(r.errors || { deptname: "Registration failed" });
  }
  return (
    <div className="stack">
      <PageHead title="Departments" subtitle="Departments of your hospital" action={<button className="btn primary" onClick={() => { reset(); setOpen(true); }}>+ Register department</button>} />
      {ok && <div className="alert info">{ok}</div>}
      {loading ? <Loading /> : error ? <ErrorBox onRetry={reload} /> : data.departments.length === 0 ? <Empty title="No departments" text="Register a department before adding doctors." /> :
        <div className="table-wrap"><table><thead><tr><th>Dept ID</th><th>Name</th><th>Head</th><th>Head mobile</th><th>Floor / wing</th><th>Doctors</th><th>Nurses</th><th>Rooms</th><th>Beds</th><th>Registered</th></tr></thead>
          <tbody>{data.departments.map((d) => <tr key={d.permanentid}><td>{d.permanentid}</td><td><b>{d.deptname}</b></td><td>{d.deptheadname}</td><td>{d.dept_head_mobile_number}</td><td>{d.floor_wing}</td>
            <td>{d.assigneddoctors}</td><td>{d.assignednurses}</td><td>{d.noofrooms}</td><td>{d.noofbeds}</td><td>{fmtDate(d.date_time)}</td></tr>)}</tbody></table></div>}
      <Modal open={open} title="Register department" onClose={() => setOpen(false)} wide>
        <form onSubmit={save}><div className="filters">
          <Field label="Department name *" error={errors.deptname}><select {...bind("deptname")}><option value="">Select</option>{(data?.options || []).map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Head of department *" error={errors.deptheadname}><input maxLength={20} {...bind("deptheadname")} /></Field>
          <Field label="Dept head mobile no. *" error={errors.dept_head_mobile_number}><input inputMode="numeric" {...bind("dept_head_mobile_number", digits(10))} /></Field>
          <Field label="Floor *" error={errors.floor_wing}><input maxLength={20} {...bind("floor_wing")} /></Field>
          <Field label="No. of assigned doctors" error={errors.assigneddoctors}><input inputMode="numeric" {...bind("assigneddoctors", digits(3))} /></Field>
          <Field label="No. of assigned nurses" error={errors.assignednurses}><input inputMode="numeric" {...bind("assignednurses", digits(3))} /></Field>
          <Field label="No. of rooms" error={errors.noofrooms}><input inputMode="numeric" {...bind("noofrooms", digits(4))} /></Field>
          <Field label="No. of beds" error={errors.noofbeds}><input inputMode="numeric" {...bind("noofbeds", digits(4))} /></Field>
        </div><div className="row"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? <span className="spinner" /> : "Register"}</button></div></form>
      </Modal>
    </div>
  );
}
