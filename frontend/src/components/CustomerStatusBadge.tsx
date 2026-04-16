import type { Customer } from "../types";

const styles: Record<Customer["status"], string> = {
  LEAD: "bg-[#ff9f0a]/10 text-[#c77d08]",
  PROSPECT: "bg-[#5ac8fa]/10 text-[#1a8fc4]",
  CUSTOMER: "bg-[#30d158]/10 text-[#1fa03f]",
  CHURNED: "bg-[#ff453a]/10 text-[#cc372e]",
};

export default function CustomerStatusBadge({
  status,
}: {
  status: Customer["status"];
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}
