import { createDeveloper } from "@/app/actions/admin";
import { DeveloperForm } from "@/components/DeveloperForm";
import { PageHeader } from "@/components/ui";
export default function NewDeveloper() {
  return (<div><PageHeader title="Add company" subtitle="A development company and its first contact. Add more contacts on the company page." /><div className="card p-6"><DeveloperForm action={createDeveloper} /></div></div>);
}
