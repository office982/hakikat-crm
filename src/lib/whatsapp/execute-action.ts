import { supabase } from "@/lib/supabase";
import { generatePaymentSchedule } from "@/lib/payment-calculator";
import { resolveTenant, resolveProject } from "./resolve-tenant";
import { sendWhatsAppMessage } from "@/lib/api/wati";
import type { AIAgentResponse } from "@/lib/api/claude";

export interface ActionResult {
  success: boolean;
  message: string; // Hebrew response to send back
}

/**
 * Execute an AI-determined action against the database.
 * This is the bridge between "the AI understood" and "the system did it".
 */
export async function executeAction(
  response: AIAgentResponse
): Promise<ActionResult> {
  const { action, data } = response;

  try {
    switch (action) {
      case "record_payment":
        return await handleRecordPayment(data);

      case "create_contract":
        return await handleCreateContract(data);

      case "add_project_expense":
        return await handleAddProjectExpense(data);

      case "query_balance":
        return await handleQueryBalance(data);

      case "query_report":
        return await handleQueryReport(data);

      case "send_reminder":
        return await handleSendReminder(data);

      case "mark_check_bounced":
        return await handleCheckBounced(data);

      case "renew_contract":
        return await handleRenewContract(data);

      case "query_reliability":
        return await handleQueryReliability(data);

      case "compare_checks":
        return await handleCompareChecks(data);

      default:
        return {
          success: true,
          message: response.response_message || "הפעולה לא מוכרת.",
        };
    }
  } catch (err) {
    console.error(`executeAction(${action}) failed:`, err);
    return {
      success: false,
      message: `שגיאה בביצוע: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`,
    };
  }
}

// ─── record_payment ──────────────────────────────────────────────
async function handleRecordPayment(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };
  if (!tenant.contract_id)
    return { success: false, message: `אין חוזה פעיל ל${tenant.full_name}.` };

  const amount = Number(data.amount);
  const monthPaidFor = String(data.month || "");
  const method = String(data.payment_method || "transfer");

  if (!amount || !monthPaidFor)
    return { success: false, message: "חסר סכום או חודש — נסה שוב." };

  // Find matching schedule row
  const { data: schedule } = await supabase
    .from("payment_schedule")
    .select("id, expected_amount")
    .eq("tenant_id", tenant.id)
    .eq("month_year", monthPaidFor)
    .single();

  // Atomic transaction via RPC
  const { data: paymentId, error } = await supabase.rpc("record_payment_tx", {
    p_tenant_id: tenant.id,
    p_contract_id: tenant.contract_id,
    p_schedule_id: schedule?.id || null,
    p_amount: amount,
    p_payment_date: new Date().toISOString().split("T")[0],
    p_month_paid_for: monthPaidFor,
    p_payment_method: method,
    p_check_number: data.check_number ? String(data.check_number) : null,
    p_check_bank: data.check_bank ? String(data.check_bank) : null,
    p_notes: data.notes ? String(data.notes) : null,
    p_expected_amount: schedule?.expected_amount || 0,
  });

  if (error) throw error;

  // Calculate remaining balance
  const { data: remaining } = await supabase
    .from("payment_schedule")
    .select("expected_amount")
    .eq("tenant_id", tenant.id)
    .in("status", ["pending", "partial", "overdue"]);

  const totalDebt = (remaining || []).reduce(
    (sum, r) => sum + Number(r.expected_amount),
    0
  );

  let msg = `✅ עודכן — ${tenant.full_name} שילם ₪${amount.toLocaleString()} עבור ${monthPaidFor}.`;
  msg += `\nיתרה: ${totalDebt > 0 ? `₪${totalDebt.toLocaleString()}` : "0 — הכל מסולק"}.`;
  msg += `\nלהוציא קבלה?`;

  return { success: true, message: msg };
}

// ─── create_contract ─────────────────────────────────────────────
async function handleCreateContract(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenantName = String(data.tenant_name || "");
  const idNumber = String(data.id_number || "");
  const phone = String(data.phone || "");
  const monthlyRent = Number(data.monthly_rent);
  const startDate = String(data.start_date || "");
  const endDate = String(data.end_date || "");
  const annualIncrease = Number(data.annual_increase || 0);
  const buildingFee = Number(data.building_fee || 0);
  const arnona = Number(data.arnona || 0);

  if (!tenantName || !monthlyRent || !startDate || !endDate)
    return { success: false, message: "חסרים פרטים ליצירת חוזה — נסה שוב." };

  // Find or create tenant
  let tenant = await resolveTenant(data);
  if (!tenant && idNumber) {
    const { data: newTenant, error } = await supabase
      .from("tenants")
      .insert({
        full_name: tenantName,
        id_number: idNumber,
        phone: phone || "0000000000",
        whatsapp: phone || null,
      })
      .select()
      .single();
    if (error) throw error;
    tenant = { id: newTenant.id, full_name: newTenant.full_name, phone: newTenant.phone };
  }

  if (!tenant)
    return { success: false, message: "לא מצאתי דייר ולא קיבלתי תעודת זהות — אי אפשר לפתוח תיק." };

  // Find unit if address/property provided
  const unitName = String(data.unit || data.address || "");
  let unitId: string | null = null;
  if (unitName) {
    const { data: units } = await supabase
      .from("units")
      .select("id, unit_identifier, property:properties(name, address)")
      .eq("is_occupied", false)
      .limit(50);

    const match = (units || []).find((u: Record<string, unknown>) => {
      const identifier = String(u.unit_identifier || "");
      const prop = u.property as Record<string, unknown> | null;
      const propName = String(prop?.name || "");
      const propAddr = String(prop?.address || "");
      return (
        identifier.includes(unitName) ||
        propName.includes(unitName) ||
        propAddr.includes(unitName) ||
        unitName.includes(identifier) ||
        unitName.includes(propName)
      );
    });
    if (match) unitId = match.id as string;
  }

  // Get default legal entity
  const { data: entities } = await supabase
    .from("legal_entities")
    .select("id")
    .limit(1);
  const legalEntityId = entities?.[0]?.id;
  if (!legalEntityId) throw new Error("אין ישות משפטית במערכת");

  // Generate payment schedule
  const schedule = generatePaymentSchedule({
    start_date: startDate,
    end_date: endDate,
    monthly_rent: monthlyRent,
    annual_increase_percent: annualIncrease,
  });

  const scheduleJson = schedule.map((row) => ({
    month_year: row.month_year,
    due_date: row.due_date,
    expected_amount: row.expected_amount,
    year_number: row.year_number,
  }));

  // Atomic transaction via RPC
  const { data: contractId, error } = await supabase.rpc("create_contract_tx", {
    p_tenant_id: tenant.id,
    p_unit_id: unitId,
    p_legal_entity_id: legalEntityId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_monthly_rent: monthlyRent,
    p_annual_increase: annualIncrease,
    p_building_fee: buildingFee,
    p_arnona: arnona,
    p_schedule: scheduleJson,
  });

  if (error) throw error;

  const months = schedule.length;
  let msg = `📄 חוזה נוצר ל${tenantName}:\n`;
  msg += `• שכירות: ₪${monthlyRent.toLocaleString()}/חודש\n`;
  msg += `• תקופה: ${startDate} עד ${endDate} (${months} חודשים)\n`;
  if (annualIncrease > 0) msg += `• עלייה שנתית: ${annualIncrease}%\n`;
  if (buildingFee > 0) msg += `• וועד בית: ₪${buildingFee}\n`;
  if (arnona > 0) msg += `• ארנונה: ₪${arnona}\n`;
  msg += `\nלוח תשלומים נוצר (${months} חודשים).`;
  msg += `\nלשלוח לחתימה דיגיטלית?`;

  return { success: true, message: msg };
}

// ─── add_project_expense ─────────────────────────────────────────
async function handleAddProjectExpense(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const project = await resolveProject(data);
  if (!project)
    return { success: false, message: `לא מצאתי פרויקט "${data.project_name}".` };

  const supplierName = String(data.supplier_name || "ספק לא ידוע");
  const amount = Number(data.amount);
  const description = String(data.description || "");
  const status = String(data.paid ? "paid" : "unpaid");

  if (!amount) return { success: false, message: "חסר סכום — נסה שוב." };

  const { data: expense, error } = await supabase
    .from("project_expenses")
    .insert({
      project_id: project.id,
      supplier_name: supplierName,
      description,
      amount,
      invoice_date: new Date().toISOString().split("T")[0],
      status,
      created_by: "whatsapp_agent",
    })
    .select()
    .single();

  if (error) throw error;

  await logAction("project", project.id, "expense_added", `הוצאה ₪${amount.toLocaleString()} — ${supplierName} — ${project.name}`, "whatsapp");

  // Get project totals
  const { data: expenses } = await supabase
    .from("project_expenses")
    .select("amount")
    .eq("project_id", project.id);

  const totalSpent = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);

  let msg = `✅ הוצאה נרשמה בפרויקט ${project.name}:\n`;
  msg += `• ספק: ${supplierName}\n`;
  msg += `• סכום: ₪${amount.toLocaleString()}\n`;
  msg += `• סטטוס: ${status === "paid" ? "שולם" : "ממתין לתשלום"}\n`;
  msg += `\nסה"כ הוצאות בפרויקט: ₪${totalSpent.toLocaleString()}`;

  return { success: true, message: msg };
}

// ─── query_balance ───────────────────────────────────────────────
async function handleQueryBalance(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };

  const { data: schedule } = await supabase
    .from("payment_schedule")
    .select("month_year, expected_amount, status")
    .eq("tenant_id", tenant.id)
    .order("due_date", { ascending: true });

  const overdue = (schedule || []).filter((s) => s.status === "overdue");
  const pending = (schedule || []).filter((s) => s.status === "pending");
  const paid = (schedule || []).filter((s) => s.status === "paid");

  const overdueTotal = overdue.reduce((s, r) => s + Number(r.expected_amount), 0);
  const pendingTotal = pending.reduce((s, r) => s + Number(r.expected_amount), 0);

  let msg = `📊 מצב תשלומים — ${tenant.full_name}:\n`;
  msg += `• שולם: ${paid.length} חודשים\n`;
  if (overdue.length > 0) {
    msg += `• 🔴 פיגור: ${overdue.length} חודשים — ₪${overdueTotal.toLocaleString()}\n`;
    msg += `  (${overdue.map((o) => o.month_year).join(", ")})\n`;
  }
  if (pending.length > 0) {
    msg += `• ממתין: ${pending.length} חודשים — ₪${pendingTotal.toLocaleString()}\n`;
  }
  if (overdue.length === 0 && pending.length === 0) {
    msg += `• ✅ הכל מסולק!`;
  }

  return { success: true, message: msg };
}

// ─── query_report ────────────────────────────────────────────────
async function handleQueryReport(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const monthYear = String(data.month || "");

  // Get all schedule items for the month
  const { data: schedule } = await supabase
    .from("payment_schedule")
    .select("expected_amount, status, tenant_id")
    .eq("month_year", monthYear);

  if (!schedule || schedule.length === 0)
    return { success: false, message: `אין נתונים עבור ${monthYear}.` };

  const totalExpected = schedule.reduce((s, r) => s + Number(r.expected_amount), 0);
  const paidRows = schedule.filter((r) => r.status === "paid");
  const totalPaid = paidRows.reduce((s, r) => s + Number(r.expected_amount), 0);
  const overdueRows = schedule.filter((r) => r.status === "overdue" || r.status === "pending");
  const totalMissing = overdueRows.reduce((s, r) => s + Number(r.expected_amount), 0);

  // Get overdue tenant names
  const overdueIds = [...new Set(overdueRows.map((r) => r.tenant_id))];
  let overdueNames: string[] = [];
  if (overdueIds.length > 0) {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("full_name")
      .in("id", overdueIds);
    overdueNames = (tenants || []).map((t) => t.full_name);
  }

  // Occupancy
  const { count: totalUnits } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true });
  const { count: occupiedUnits } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("is_occupied", true);
  const occupancy = totalUnits ? Math.round(((occupiedUnits || 0) / totalUnits) * 100) : 0;

  // Project expenses for the month
  const { data: projExpenses } = await supabase
    .from("project_expenses")
    .select("amount")
    .gte("invoice_date", `${monthYear.split("/")[1]}-${monthYear.split("/")[0]}-01`)
    .lt(
      "invoice_date",
      `${monthYear.split("/")[1]}-${String(Number(monthYear.split("/")[0]) + 1).padStart(2, "0")}-01`
    );
  const totalProjectExpenses = (projExpenses || []).reduce(
    (s, e) => s + Number(e.amount),
    0
  );

  let msg = `📋 סיכום ${monthYear}:\n`;
  msg += `• גבייה: ₪${totalPaid.toLocaleString()} / ₪${totalExpected.toLocaleString()}\n`;
  if (totalMissing > 0) {
    msg += `• חסר: ₪${totalMissing.toLocaleString()} (${overdueRows.length} דיירים)\n`;
  }
  if (overdueNames.length > 0) {
    msg += `• מפגרים: ${overdueNames.join(", ")}\n`;
  }
  if (totalProjectExpenses > 0) {
    msg += `• הוצאות פרויקטים: ₪${totalProjectExpenses.toLocaleString()}\n`;
  }
  const cashFlow = totalPaid - totalProjectExpenses;
  msg += `• תזרים נקי: ₪${cashFlow.toLocaleString()}\n`;
  msg += `• תפוסה: ${occupancy}% (${occupiedUnits || 0}/${totalUnits || 0} יחידות)`;

  return { success: true, message: msg };
}

// ─── send_reminder ───────────────────────────────────────────────
async function handleSendReminder(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };

  // Get overdue amounts
  const { data: overdue } = await supabase
    .from("payment_schedule")
    .select("month_year, expected_amount")
    .eq("tenant_id", tenant.id)
    .in("status", ["overdue", "pending"])
    .order("due_date", { ascending: true })
    .limit(3);

  if (!overdue || overdue.length === 0)
    return { success: true, message: `${tenant.full_name} מעודכן — אין חוב.` };

  const totalDebt = overdue.reduce((s, r) => s + Number(r.expected_amount), 0);
  const months = overdue.map((r) => r.month_year).join(", ");

  const reminderMsg =
    `שלום ${tenant.full_name}, ` +
    `יש יתרה פתוחה של ₪${totalDebt.toLocaleString()} ` +
    `עבור ${months}. ` +
    `נודה להסדרה. תודה — קבוצת חקיקת`;

  const tenantPhone = tenant.phone.replace(/^0/, "972");
  await sendWhatsAppMessage(tenantPhone, reminderMsg);

  await logAction("tenant", tenant.id, "reminder_sent", `תזכורת תשלום ₪${totalDebt.toLocaleString()} — ${tenant.full_name}`, "whatsapp");

  return {
    success: true,
    message: `✅ תזכורת נשלחה ל${tenant.full_name} — חוב ₪${totalDebt.toLocaleString()} (${months}).`,
  };
}

// ─── mark_check_bounced ──────────────────────────────────────────
async function handleCheckBounced(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };

  const forMonth = String(data.month || "");
  if (!forMonth)
    return { success: false, message: "חסר חודש — עבור איזה חודש הצ'ק חזר?" };

  const reason = data.reason ? String(data.reason) : null;

  const { data: result, error } = await supabase.rpc("bounce_check_tx", {
    p_tenant_id: tenant.id,
    p_for_month: forMonth,
    p_reason: reason,
  });

  if (error) throw error;

  const payload = (result || {}) as {
    check_id?: string;
    schedule_id?: string;
    amount?: number;
  };

  const amountStr = payload.amount
    ? ` (₪${Number(payload.amount).toLocaleString()})`
    : "";

  // Also raise a notification so it shows up in the dashboard.
  await supabase.from("notifications").insert({
    type: "check_bounced",
    entity_type: "check",
    entity_id: payload.check_id || tenant.id,
    title: `🔴 צ'ק חוזר — ${tenant.full_name}`,
    message: `צ'ק עבור ${forMonth}${amountStr} חזר. יש לעדכן את הדייר ולסדר תשלום חלופי.`,
  });

  // Notify the tenant on WhatsApp.
  const tenantPhone = tenant.phone.replace(/^0/, "972");
  const bounceMsg =
    `שלום ${tenant.full_name}, הצ'ק עבור ${forMonth}${amountStr} חזר. ` +
    `נא ליצור קשר לסידור התשלום. תודה — קבוצת חקיקת`;
  await sendWhatsAppMessage(tenantPhone, bounceMsg);

  return {
    success: true,
    message: `🔴 צ'ק חוזר — ${tenant.full_name}, ${forMonth}${amountStr}.\nהתשלום סומן כחוזר, היתרה עודכנה, ונשלחה הודעה לדייר.`,
  };
}

// ─── renew_contract ──────────────────────────────────────────────
// When called from the confirmation flow (pending_action → confirmed),
// this actually creates the new renewal contract via the renew_contract_tx RPC.
async function handleRenewContract(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };
  if (!tenant.contract_id)
    return { success: false, message: `אין חוזה פעיל ל${tenant.full_name}.` };

  const { data: currentContract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", tenant.contract_id)
    .single();

  if (!currentContract) return { success: false, message: "שגיאה — חוזה לא נמצא." };

  // Default new rent: same base rent + 1 more year of the configured annual_increase,
  // unless the user supplied an explicit new_rent in the conversation.
  const annualInc = Number(currentContract.annual_increase_percent || 0);
  const defaultBumped = Math.round(
    Number(currentContract.monthly_rent) * (1 + annualInc / 100)
  );
  const newRent = Number(data.new_rent || defaultBumped);

  const currentEnd = new Date(currentContract.end_date);
  const newStart = new Date(currentEnd);
  newStart.setDate(newStart.getDate() + 1);
  const months = Number(data.months || 12);
  const newEnd = new Date(newStart);
  newEnd.setMonth(newEnd.getMonth() + months);
  newEnd.setDate(newEnd.getDate() - 1);

  const newStartStr = newStart.toISOString().split("T")[0];
  const newEndStr = newEnd.toISOString().split("T")[0];

  // Build payment schedule for the new period.
  const schedule = generatePaymentSchedule({
    start_date: newStartStr,
    end_date: newEndStr,
    monthly_rent: newRent,
    annual_increase_percent: annualInc,
  });

  const scheduleJson = schedule.map((row) => ({
    month_year: row.month_year,
    due_date: row.due_date,
    expected_amount: row.expected_amount,
    year_number: row.year_number,
  }));

  const { data: newContractId, error } = await supabase.rpc("renew_contract_tx", {
    p_old_contract_id: currentContract.id,
    p_new_rent: newRent,
    p_months: months,
    p_schedule: scheduleJson,
  });

  if (error) throw error;

  await logAction(
    "contract",
    newContractId as string,
    "contract_renewed",
    `חידוש חוזה ל${tenant.full_name} — ₪${newRent.toLocaleString()}/חודש, ${newStartStr} עד ${newEndStr}`,
    "whatsapp"
  );

  let msg = `📄 חוזה חידוש נוצר ל${tenant.full_name}:\n`;
  msg += `• תקופה: ${newStartStr} עד ${newEndStr}\n`;
  msg += `• שכירות: ₪${newRent.toLocaleString()}/חודש`;
  if (newRent !== currentContract.monthly_rent) {
    msg += ` (היה ₪${Number(currentContract.monthly_rent).toLocaleString()})`;
  }
  msg += `\n\nלשלוח לדייר לחתימה דיגיטלית?`;

  return { success: true, message: msg };
}

// ─── Issue receipt (post-confirmation helper) ────────────────────
// Reuses the shared `issueReceiptForPayment` helper so the WhatsApp
// flow, the UI, and the webhook paths all share one implementation.
export async function issueReceipt(
  tenantId: string,
  amount: number,
  _description: string
): Promise<ActionResult> {
  try {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("full_name")
      .eq("id", tenantId)
      .single();
    if (!tenant) return { success: false, message: "דייר לא נמצא." };

    // Find the most recent un-invoiced payment for this tenant matching the amount.
    const { data: payment } = await supabase
      .from("payments")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("amount", amount)
      .is("icount_receipt_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      return { success: false, message: "לא מצאתי תשלום תואם להנפקת קבלה." };
    }

    const { issueReceiptForPayment } = await import("@/lib/receipts");
    const result = await issueReceiptForPayment(payment.id);

    if (result.skipped) {
      return { success: true, message: "ישות פרטי — לא מפיקה קבלות." };
    }
    if (!result.success) {
      return { success: false, message: "שגיאה בהנפקת קבלה." };
    }

    return {
      success: true,
      message: `🧾 קבלה #${result.doc_number} הופקה — ₪${amount.toLocaleString()} ל${tenant.full_name}.`,
    };
  } catch (err) {
    console.error("issueReceipt failed:", err);
    return { success: false, message: "שגיאה בהנפקת קבלה." };
  }
}

// ─── query_reliability ───────────────────────────────────────────
async function handleQueryReliability(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };

  const { data: row } = await supabase
    .from("tenants")
    .select("reliability_score, reliability_computed_at")
    .eq("id", tenant.id)
    .single();

  const score = row?.reliability_score ?? 100;
  const { tierFor, tierLabelHe } = await import("@/lib/reliability");
  const tier = tierFor(score);
  const computed = row?.reliability_computed_at
    ? new Date(row.reliability_computed_at).toISOString().split("T")[0]
    : "עדיין לא חושב";

  const { count: bounced } = await supabase
    .from("checks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "bounced");

  const { count: overdue } = await supabase
    .from("payment_schedule")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("status", "overdue");

  let msg = `⭐ דירוג אמינות — ${tenant.full_name}:\n`;
  msg += `• ציון: ${score}/100 (${tierLabelHe(tier)})\n`;
  if ((bounced || 0) > 0) msg += `• צ'קים חוזרים: ${bounced}\n`;
  if ((overdue || 0) > 0) msg += `• חודשים בפיגור: ${overdue}\n`;
  msg += `• עודכן לאחרונה: ${computed}`;

  return { success: true, message: msg };
}

// ─── compare_checks ──────────────────────────────────────────────
async function handleCompareChecks(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };
  if (!tenant.contract_id)
    return { success: false, message: `אין חוזה פעיל ל${tenant.full_name}.` };

  const { compareChecksForContract, formatComparisonHe } = await import("@/lib/check-comparison");
  const result = await compareChecksForContract(tenant.contract_id);
  return {
    success: true,
    message: `${tenant.full_name}\n${formatComparisonHe(result)}`,
  };
}

// ─── Helper ──────────────────────────────────────────────────────
async function logAction(
  entityType: string,
  entityId: string,
  action: string,
  description: string,
  source: string
) {
  await supabase.from("action_logs").insert({
    entity_type: entityType,
    entity_id: entityId,
    action,
    description,
    source,
    performed_by: "whatsapp_agent",
  });
}
