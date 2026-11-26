import type { Invoice } from "./model";

const labels: Record<string, string> = {
  northgate: "Short receipt", smith: "Unclear invoice", meghna: "Approver away",
  vantage: "Bank details", kowalczyk: "Currency mismatch",
};

const summaries: Record<string, string> = {
  cpe: "Price 3.1% above PO. Withholding tax not shown.",
  northgate: "Goods receipt covers 40 of 60 units.",
  brightwater: "Possible duplicate of INV 20991A, paid 12 Nov.",
  smith: "Phone photo. Total and date unclear. No PO.",
  meghna: "Approver Farhana Rahman on leave until 8 Dec.",
  vantage: "Supplier emailed new bank details on 20 Nov.",
  kowalczyk: "Invoiced in EUR; PO is in GBP.",
};

export const invoiceIssueLabel = (invoice: Invoice) => labels[invoice.id] ?? invoice.type;
export const invoiceIssueSummary = (invoice: Invoice) => summaries[invoice.id] ?? invoice.issue;
