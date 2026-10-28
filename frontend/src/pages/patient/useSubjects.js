import { useAuth } from "../../auth";
import { useApi } from "../../components/ui";

// "Self" + the children registered by the patient (old Self / Child tabs and selects)
export function useSubjects() {
  const { user } = useAuth();
  const kids = useApi(user.validated === false ? "patient/access" : "patient/children");
  const children = (kids.data?.children || []).map((c) => ({ id: c.child_id, name: [c.childfname, (c.mname || "").trim(), c.lname].filter(Boolean).join(" "), gender: c.gender, child: true, raw: c }));
  return { loading: kids.loading, children, subjects: [{ id: user.permanentid, name: user.name, gender: user.gender, child: false }, ...children], reload: kids.reload };
}
