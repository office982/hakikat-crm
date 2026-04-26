import { NextRequest, NextResponse } from "next/server";
import { recordCheckAsPayment, dueDateToForMonth, type RecordCheckResult } from "@/lib/checks-to-payments";

interface ScannedCheck {
  check_number: string | null;
  bank_name: string | null;
  branch_number: string | null;
  account_number: string | null;
  amount: number | null;
  due_date: string | null;
}

interface Body {
  tenant_id: string;
  contract_id: string;
  checks: ScannedCheck[];
  source?: "manual" | "whatsapp_agent";
}

/**
 * Persist scanned checks as full payment events (check + payment + receipt).
 * Returns per-check results so the UI can show what was issued.
 */
export async function POST(request: NextRequest) {
  try {
    const body: Body = await request.json();

    if (!body.tenant_id || !body.contract_id || !Array.isArray(body.checks)) {
      return NextResponse.json({ error: "פרמטרים חסרים" }, { status: 400 });
    }

    const results: (RecordCheckResult & { check_number: string; for_month: string })[] = [];
    const errors: { check_number: string; error: string }[] = [];

    for (const c of body.checks) {
      if (!c.check_number || !c.amount || !c.due_date) {
        errors.push({
          check_number: c.check_number || "?",
          error: "חסר מספר צ'ק / סכום / תאריך פירעון",
        });
        continue;
      }
      try {
        const r = await recordCheckAsPayment({
          tenant_id: body.tenant_id,
          contract_id: body.contract_id,
          check_number: c.check_number,
          bank_name: c.bank_name,
          branch_number: c.branch_number,
          account_number: c.account_number,
          amount: c.amount,
          due_date: c.due_date,
          for_month: dueDateToForMonth(c.due_date),
          source: body.source || "manual",
        });
        results.push({ ...r, check_number: c.check_number, for_month: dueDateToForMonth(c.due_date) });
      } catch (err) {
        errors.push({
          check_number: c.check_number,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ results, errors });
  } catch (err) {
    console.error("scan-and-record failed:", err);
    return NextResponse.json(
      { error: "שגיאה בשמירה", details: String(err) },
      { status: 500 }
    );
  }
}
