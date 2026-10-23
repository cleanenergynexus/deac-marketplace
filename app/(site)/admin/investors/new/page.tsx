import { createInvestor } from "@/app/actions/admin";
import { InvestorForm } from "@/components/InvestorForm";
import { PageHeader } from "@/components/ui";
export default function NewInvestor() {
  return (<div><PageHeader title="Add investor" /><div className="card p-6"><InvestorForm action={createInvestor} /></div></div>);
}
