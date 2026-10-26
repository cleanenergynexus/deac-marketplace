import { createDeveloper } from "@/app/actions/admin";
import { DeveloperForm } from "@/components/DeveloperForm";
import { PageHeader } from "@/components/ui";
export default function NewDeveloper() {
  return (<div><PageHeader title="Add developer" /><div className="card p-6"><DeveloperForm action={createDeveloper} /></div></div>);
}
