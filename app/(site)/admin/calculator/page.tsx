import { Calculator } from "@/components/Calculator";
import { PageHeader } from "@/components/ui";

export default function CalculatorPage() {
  return (
    <div>
      <PageHeader title="Valuation calculator" subtitle="Quick screening for new leads. To save a score to a lead, open the listing and use the Valuation section." />
      <Calculator />
    </div>
  );
}
