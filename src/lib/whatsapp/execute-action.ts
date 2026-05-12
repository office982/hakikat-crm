import { supabaseAdmin as supabase } from "@/lib/supabase";
import { generatePaymentSchedule } from "@/lib/payment-calculator";
import { resolveTenant, resolveProject } from "./resolve-tenant";
import { sendWhatsAppMessage } from "@/lib/api/wati";
import type { AIAgentResponse } from "@/lib/api/claude";
import { recordCheckAsPayment, dueDateToForMonth } from "@/lib/checks-to-payments";
import { notifyAction } from "@/lib/notifications";

// Maps each WhatsApp action to a short notification title shown in the
// alerts page. Pure-query actions (balance, report, list) skip the
// notification — they're not state changes.
const NOTIFY_TITLE: Record<string, (data: Record<string, unknown>) => string> = {
  record_payment: (d) => `💰 תשלום נרשם — ${d.tenant_name} (${d.month})`,
  create_contract: (d) => `📄 חוזה נוצר — ${d.tenant_name}`,
  add_project_expense: (d) => `🔧 הוצאה בפרויקט — ${d.project_name} ₪${d.amount}`,
  send_reminder: (d) => `📨 תזכורת נשלחה — ${d.tenant_name}`,
  mark_check_bounced: (d) => `🔴 צ'ק חוזר — ${d.tenant_name}`,
  renew_contract: (d) => `🔁 חידוש חוזה — ${d.tenant_name}`,
  create_project: (d) => `📁 פרויקט חדש — ${d.project_name || d.name}`,
  delete_project: (d) => `🗑 פרויקט נמחק — ${d.project_name}`,
  send_contract_for_signature: (d) => `📤 חוזה נשלח לחתימה — ${d.tenant_name}`,
  mark_expense_paid: (d) => `✅ הוצאה שולמה — ${d.project_name}`,
};

const NOTIFY_ENTITY_TYPE: Record<string, string> = {
  record_payment: "payment",
  create_contract: "contract",
  add_project_expense: "project",
  send_reminder: "tenant",
  mark_check_bounced: "check",
  renew_contract: "contract",
  create_project: "project",
  delete_project: "project",
  send_contract_for_signature: "contract",
  mark_expense_paid: "project",
};

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

  let result: ActionResult;
  try {
    result = await dispatch(action, data, response);
  } catch (err) {
    console.error(`executeAction(${action}) failed:`, err);
    result = {
      success: false,
      message: `שגיאה בביצוע: ${err instanceof Error ? err.message : "שגיאה לא ידועה"}`,
    };
  }

  // Fire-and-forget notification on success — never block the user reply.
  if (result.success) void maybeNotify(action, data);

  return result;
}

async function dispatch(
  action: string,
  data: Record<string, unknown>,
  response: AIAgentResponse
): Promise<ActionResult> {
  switch (action) {
    case "record_payment": return handleRecordPayment(data);
    case "create_contract": return handleCreateContract(data);
    case "add_project_expense": return handleAddProjectExpense(data);
    case "query_balance": return handleQueryBalance(data);
    case "query_report": return handleQueryReport(data);
    case "send_reminder": return handleSendReminder(data);
    case "mark_check_bounced": return handleCheckBounced(data);
    case "renew_contract": return handleRenewContract(data);
    case "query_reliability": return handleQueryReliability(data);
    case "compare_checks": return handleCompareChecks(data);
    case "create_project": return handleCreateProject(data);
    case "list_projects": return handleListProjects();
    case "delete_project": return handleDeleteProject(data);
    case "list_overdue": return handleListOverdue();
    case "query_project_status": return handleQueryProjectStatus(data);
    case "list_expiring_contracts": return handleListExpiringContracts(data);
    case "send_contract_for_signature": return handleSendContractForSignature(data);
    case "list_properties": return handleListProperties();
    case "list_vacant_units": return handleListVacantUnits();
    case "query_occupancy": return handleQueryOccupancy();
    case "query_property": return handleQueryProperty(data);
    case "list_recent_checks": return handleListRecentChecks(data);
    case "list_recent_alerts": return handleListRecentAlerts(data);
    case "mark_expense_paid": return handleMarkExpensePaid(data);
    default:
      return {
        success: true,
        message: response.response_message || "הפעולה לא מוכרת.",
      };
  }
}

async function maybeNotify(action: string, data: Record<string, unknown>) {
  try {
    const titleFn = NOTIFY_TITLE[action];
    const entityType = NOTIFY_ENTITY_TYPE[action];
    if (!titleFn || !entityType) return;

    // Best effort: resolve entity_id when possible
    let entityId: string | null = null;
    if (entityType === "tenant" || entityType === "payment" || entityType === "contract" || entityType === "check") {
      const t = await resolveTenant(data);
      if (t) entityId = t.id;
    }
    if (!entityId && entityType === "project") {
      const p = await resolveProject(data);
      if (p) entityId = p.id;
    }
    if (!entityId) entityId = "00000000-0000-0000-0000-000000000000";

    await notifyAction({
      type: action,
      entity_type: entityType,
      entity_id: entityId,
      title: titleFn(data),
    });
  } catch (err) {
    console.error("maybeNotify failed:", err);
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

// ─── create_project ──────────────────────────────────────────────
async function handleCreateProject(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const name = String(data.project_name || data.name || "").trim();
  const totalBudget = Number(data.total_budget || data.budget || 0);
  const status = String(data.status || "active") as "planning" | "active" | "completed";
  const address = data.address ? String(data.address) : null;
  const description = data.description ? String(data.description) : null;

  if (!name) return { success: false, message: "חסר שם פרויקט." };

  // Pick first legal entity if not specified
  let legalEntityId = data.legal_entity_id ? String(data.legal_entity_id) : null;
  if (!legalEntityId) {
    const { data: ents } = await supabase
      .from("legal_entities")
      .select("id")
      .limit(1);
    legalEntityId = ents?.[0]?.id || null;
  }
  if (!legalEntityId) return { success: false, message: "אין ישות משפטית במערכת." };

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name,
      legal_entity_id: legalEntityId,
      address,
      description,
      total_budget: totalBudget,
      status,
    })
    .select()
    .single();
  if (error) throw error;

  await logAction("project", project.id, "project_created", `נפתח פרויקט ${name}`, "whatsapp");

  let msg = `📁 פרויקט נוצר: ${name}\n`;
  if (totalBudget > 0) msg += `• תקציב: ₪${totalBudget.toLocaleString()}\n`;
  msg += `• סטטוס: ${status === "active" ? "פעיל" : status === "planning" ? "בתכנון" : "הושלם"}`;
  return { success: true, message: msg };
}

// ─── list_projects ───────────────────────────────────────────────
async function handleListProjects(): Promise<ActionResult> {
  const { data: projects } = await supabase
    .from("projects")
    .select(`id, name, status, total_budget, expenses:project_expenses(amount)`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!projects || projects.length === 0)
    return { success: true, message: "אין פרויקטים פעילים." };

  let msg = `📁 פרויקטים (${projects.length}):\n`;
  for (const p of projects) {
    const spent = ((p.expenses as { amount: number }[]) || []).reduce(
      (s, e) => s + Number(e.amount || 0),
      0
    );
    const remaining = Number(p.total_budget || 0) - spent;
    const statusHe =
      p.status === "active" ? "פעיל" : p.status === "planning" ? "בתכנון" : "הושלם";
    msg += `\n• ${p.name} (${statusHe})\n`;
    msg += `  תקציב ₪${Number(p.total_budget || 0).toLocaleString()} · `;
    msg += `הוצאות ₪${spent.toLocaleString()} · `;
    msg += `נותר ₪${remaining.toLocaleString()}`;
  }
  return { success: true, message: msg };
}

// ─── delete_project ──────────────────────────────────────────────
async function handleDeleteProject(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const project = await resolveProject(data);
  if (!project)
    return { success: false, message: `לא מצאתי פרויקט "${data.project_name}".` };

  const { count } = await supabase
    .from("project_expenses")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id);

  if ((count || 0) > 0) {
    return {
      success: false,
      message: `לפרויקט "${project.name}" יש ${count} הוצאות. מחק אותן קודם או סגור את הפרויקט במקום למחוק.`,
    };
  }

  const { error } = await supabase.from("projects").delete().eq("id", project.id);
  if (error) throw error;

  await logAction("project", project.id, "project_deleted", `פרויקט נמחק: ${project.name}`, "whatsapp");
  return { success: true, message: `🗑 הפרויקט "${project.name}" נמחק.` };
}

// ─── query_project_status ────────────────────────────────────────
async function handleQueryProjectStatus(
  data: Record<string, unknown>
): Promise<ActionResult> {
  // Don't filter by status — user may ask about planning/completed projects too.
  const name = String(data.project_name || "").trim();
  if (!name) return { success: false, message: "חסר שם פרויקט." };

  const { data: matches } = await supabase
    .from("projects")
    .select("id, name")
    .ilike("name", `%${name}%`)
    .limit(1);
  const project = matches?.[0];
  if (!project)
    return { success: false, message: `לא מצאתי פרויקט "${name}".` };

  const { data: full } = await supabase
    .from("projects")
    .select("id, name, status, total_budget, address, start_date, end_date")
    .eq("id", project.id)
    .single();

  if (!full) return { success: false, message: "שגיאה בטעינת הפרויקט." };

  const { data: expenses } = await supabase
    .from("project_expenses")
    .select("amount, status, supplier_name, supplier_id, suppliers(name)")
    .eq("project_id", project.id);

  const totalSpent = (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalUnpaid = (expenses || [])
    .filter((e) => e.status === "unpaid")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalBudget = Number(full.total_budget || 0);
  const remaining = totalBudget - totalSpent;
  const percent = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const unpaidCount = (expenses || []).filter((e) => e.status === "unpaid").length;

  // Top suppliers by amount
  const bySupplier = new Map<string, number>();
  for (const e of expenses || []) {
    const sup = e as Record<string, unknown>;
    const name =
      (sup.suppliers as { name: string } | null)?.name ||
      (sup.supplier_name as string) ||
      "ללא שם";
    bySupplier.set(name, (bySupplier.get(name) || 0) + Number(e.amount || 0));
  }
  const topSuppliers = Array.from(bySupplier.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const statusHe =
    full.status === "active" ? "פעיל" : full.status === "planning" ? "בתכנון" : "הושלם";

  let msg = `📁 ${full.name} (${statusHe}):\n`;
  if (full.address) msg += `• כתובת: ${full.address}\n`;
  msg += `• תקציב: ₪${totalBudget.toLocaleString()}\n`;
  msg += `• הוצאה בפועל: ₪${totalSpent.toLocaleString()} (${percent}%)\n`;
  msg += `• נותר: ₪${remaining.toLocaleString()}\n`;
  if (unpaidCount > 0) {
    msg += `• 🔴 חשבוניות לא משולמות: ${unpaidCount} (₪${totalUnpaid.toLocaleString()})\n`;
  }
  if (topSuppliers.length > 0) {
    msg += `\nספקים עיקריים:`;
    for (const [name, amount] of topSuppliers) {
      msg += `\n  • ${name} — ₪${amount.toLocaleString()}`;
    }
  }
  return { success: true, message: msg };
}

// ─── list_overdue ────────────────────────────────────────────────
async function handleListOverdue(): Promise<ActionResult> {
  const { data: rows } = await supabase
    .from("payment_schedule")
    .select("month_year, expected_amount, tenant:tenants(full_name)")
    .eq("status", "overdue")
    .order("due_date", { ascending: true })
    .limit(50);

  if (!rows || rows.length === 0)
    return { success: true, message: "✅ אין דיירים בפיגור — הכל מסולק!" };

  const byTenant = new Map<string, { months: string[]; total: number }>();
  for (const r of rows) {
    const t = r.tenant as unknown as { full_name: string } | null;
    const name = t?.full_name || "ללא שם";
    const cur = byTenant.get(name) || { months: [], total: 0 };
    cur.months.push(r.month_year);
    cur.total += Number(r.expected_amount || 0);
    byTenant.set(name, cur);
  }

  let msg = `🔴 דיירים בפיגור (${byTenant.size}):\n`;
  for (const [name, info] of byTenant) {
    msg += `\n• ${name} — ₪${info.total.toLocaleString()} (${info.months.join(", ")})`;
  }
  return { success: true, message: msg };
}

// ─── list_expiring_contracts ─────────────────────────────────────
async function handleListExpiringContracts(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const days = Number(data.days || 60);
  const today = new Date();
  const cutoff = new Date();
  cutoff.setDate(today.getDate() + days);

  const { data: rows } = await supabase
    .from("contracts")
    .select(
      `id, end_date, monthly_rent, status,
       tenant:tenants(full_name, phone)`
    )
    .eq("status", "active")
    .gte("end_date", today.toISOString().split("T")[0])
    .lte("end_date", cutoff.toISOString().split("T")[0])
    .order("end_date", { ascending: true })
    .limit(30);

  if (!rows || rows.length === 0) {
    return {
      success: true,
      message: `✅ אין חוזים שפגים ב-${days} הימים הקרובים.`,
    };
  }

  let msg = `📅 חוזים שפגים ב-${days} הימים הקרובים (${rows.length}):\n`;
  for (const c of rows) {
    const t = c.tenant as unknown as { full_name: string; phone: string } | null;
    const name = t?.full_name || "ללא שם";
    msg += `\n• ${name} — פג ${c.end_date} (₪${Number(c.monthly_rent).toLocaleString()}/חודש)`;
  }
  return { success: true, message: msg };
}

// ─── send_contract_for_signature ─────────────────────────────────
async function handleSendContractForSignature(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const tenant = await resolveTenant(data);
  if (!tenant)
    return { success: false, message: `לא מצאתי דייר בשם "${data.tenant_name}".` };

  // Find the most recent pending-signature contract; fall back to active.
  const { data: contract } = await supabase
    .from("contracts")
    .select(
      `id, status, monthly_rent, start_date, end_date, building_fee, arnona,
       annual_increase_percent,
       unit:units(unit_identifier, property:properties(name, address)),
       legal_entity:legal_entities(name)`
    )
    .eq("tenant_id", tenant.id)
    .in("status", ["pending_signature", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!contract)
    return { success: false, message: `אין חוזה ל${tenant.full_name} שניתן לשלוח לחתימה.` };

  if (contract.status === "active") {
    return { success: false, message: `החוזה של ${tenant.full_name} כבר חתום ופעיל.` };
  }

  // Render the contract text via the AI helper, then POST to the existing
  // send-for-signature endpoint. This is exactly what the wizard does.
  const unit = contract.unit as unknown as
    | { unit_identifier: string; property: { name: string; address: string | null } | null }
    | null;
  const legalEntity = contract.legal_entity as unknown as { name: string } | null;

  const { generateContractText } = await import("@/lib/api/claude");
  const contractText = await generateContractText({
    tenant_name: tenant.full_name,
    id_number: String(data.id_number || ""),
    unit: unit?.unit_identifier || "",
    property: unit?.property?.name || unit?.property?.address || "",
    start_date: contract.start_date,
    end_date: contract.end_date,
    monthly_rent: Number(contract.monthly_rent),
    annual_increase: Number(contract.annual_increase_percent || 0),
    building_fee: Number(contract.building_fee || 0),
    arnona: Number(contract.arnona || 0),
    entity_name: legalEntity?.name || "",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const res = await fetch(`${baseUrl}/api/contracts/${contract.id}/send-for-signature`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract_text: contractText }),
  });

  if (!res.ok) {
    const err = await res.text();
    return {
      success: false,
      message: `שגיאה בשליחה לחתימה: ${err.slice(0, 200)}`,
    };
  }

  return {
    success: true,
    message: `📤 החוזה של ${tenant.full_name} נשלח לחתימה דיגיטלית. ממתין לחתימת הדייר.`,
  };
}

// ─── list_properties ─────────────────────────────────────────────
async function handleListProperties(): Promise<ActionResult> {
  const { data: properties } = await supabase
    .from("properties")
    .select(`
      id, name, address, city, property_type, suggested_rent,
      units(id, is_occupied)
    `)
    .order("name", { ascending: true })
    .limit(50);

  if (!properties || properties.length === 0)
    return { success: true, message: "אין נכסים במערכת." };

  let msg = `🏢 נכסים (${properties.length}):\n`;
  for (const p of properties) {
    const units = (p.units as { id: string; is_occupied: boolean }[]) || [];
    const occupied = units.filter((u) => u.is_occupied).length;
    const typeHe =
      p.property_type === "residential" ? "מגורים" :
      p.property_type === "commercial" ? "מסחרי" : "מעורב";
    msg += `\n• ${p.name} (${typeHe}) — ${occupied}/${units.length} תפוסות`;
    if (p.address) msg += `\n  ${p.address}${p.city ? ", " + p.city : ""}`;
  }
  return { success: true, message: msg };
}

// ─── list_vacant_units ───────────────────────────────────────────
async function handleListVacantUnits(): Promise<ActionResult> {
  const { data: units } = await supabase
    .from("units")
    .select(
      `id, unit_identifier, unit_type, floor, size_sqm,
       property:properties(name, suggested_rent)`
    )
    .eq("is_occupied", false)
    .limit(50);

  if (!units || units.length === 0)
    return { success: true, message: "✅ אין יחידות פנויות — הכל תפוס." };

  let msg = `🔓 יחידות פנויות (${units.length}):\n`;
  for (const u of units) {
    const prop = u.property as unknown as { name: string; suggested_rent: number | null } | null;
    const propName = prop?.name || "ללא נכס";
    const rent = prop?.suggested_rent ? ` — מוצע ₪${Number(prop.suggested_rent).toLocaleString()}` : "";
    const floor = u.floor != null ? `, קומה ${u.floor}` : "";
    const size = u.size_sqm ? `, ${u.size_sqm} מ״ר` : "";
    msg += `\n• ${propName} — ${u.unit_identifier}${floor}${size}${rent}`;
  }
  return { success: true, message: msg };
}

// ─── query_occupancy ─────────────────────────────────────────────
async function handleQueryOccupancy(): Promise<ActionResult> {
  const { count: totalUnits } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true });
  const { count: occupied } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("is_occupied", true);

  const total = totalUnits || 0;
  const occ = occupied || 0;
  const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
  const vacant = total - occ;

  let msg = `📊 תפוסה כוללת:\n`;
  msg += `• סה"כ יחידות: ${total}\n`;
  msg += `• תפוסות: ${occ}\n`;
  msg += `• פנויות: ${vacant}\n`;
  msg += `• אחוז תפוסה: ${pct}%`;
  return { success: true, message: msg };
}

// ─── query_property ──────────────────────────────────────────────
async function handleQueryProperty(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const name = String(data.property_name || data.name || "").trim();
  if (!name) return { success: false, message: "חסר שם נכס." };

  const { data: matches } = await supabase
    .from("properties")
    .select(
      `id, name, address, city, property_type, suggested_rent,
       units(id, unit_identifier, is_occupied)`
    )
    .or(`name.ilike.%${name}%,address.ilike.%${name}%`)
    .limit(1);

  const prop = matches?.[0];
  if (!prop) return { success: false, message: `לא מצאתי נכס "${name}".` };

  const units = (prop.units as { id: string; unit_identifier: string; is_occupied: boolean }[]) || [];
  const occupied = units.filter((u) => u.is_occupied).length;
  const vacant = units.length - occupied;
  const typeHe =
    prop.property_type === "residential" ? "מגורים" :
    prop.property_type === "commercial" ? "מסחרי" : "מעורב";

  let msg = `🏢 ${prop.name} (${typeHe}):\n`;
  if (prop.address) msg += `• כתובת: ${prop.address}${prop.city ? ", " + prop.city : ""}\n`;
  msg += `• יחידות: ${units.length} (תפוסות: ${occupied}, פנויות: ${vacant})\n`;
  if (prop.suggested_rent) {
    msg += `• מחיר מוצע: ₪${Number(prop.suggested_rent).toLocaleString()}/חודש\n`;
  }
  if (vacant > 0) {
    const vacantList = units.filter((u) => !u.is_occupied).map((u) => u.unit_identifier);
    msg += `• פנויות: ${vacantList.join(", ")}`;
  }
  return { success: true, message: msg };
}

// ─── list_recent_checks ──────────────────────────────────────────
async function handleListRecentChecks(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const limit = Math.min(Math.max(Number(data.limit || 10), 1), 30);

  const { data: checks } = await supabase
    .from("checks")
    .select(
      `id, check_number, amount, due_date, status, for_month, bank_name,
       tenant:tenants(full_name)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!checks || checks.length === 0)
    return { success: true, message: "אין צ'קים במערכת." };

  const statusLabel: Record<string, string> = {
    pending: "ממתין",
    deposited: "הופקד",
    bounced: "🔴 חזר",
    cancelled: "בוטל",
  };

  let msg = `🧾 צ'קים אחרונים (${checks.length}):\n`;
  for (const c of checks) {
    const t = c.tenant as unknown as { full_name: string } | null;
    const name = t?.full_name || "ללא שם";
    const bank = c.bank_name ? ` [${c.bank_name}]` : "";
    msg += `\n• ${name} — צ'ק ${c.check_number}${bank}, ₪${Number(c.amount).toLocaleString()}, ${c.for_month}, ${statusLabel[c.status] || c.status}`;
  }
  return { success: true, message: msg };
}

// ─── list_recent_alerts ──────────────────────────────────────────
async function handleListRecentAlerts(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const limit = Math.min(Math.max(Number(data.limit || 10), 1), 30);
  const onlyUnread = Boolean(data.unread_only);

  let query = supabase
    .from("notifications")
    .select("type, title, message, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (onlyUnread) query = query.eq("is_read", false);

  const { data: rows } = await query;

  if (!rows || rows.length === 0)
    return { success: true, message: onlyUnread ? "✅ אין התראות חדשות." : "אין התראות במערכת." };

  let msg = `🔔 התראות אחרונות (${rows.length}):\n`;
  for (const n of rows) {
    const when = new Date(n.created_at).toLocaleDateString("he-IL");
    const dot = n.is_read ? "○" : "●";
    msg += `\n${dot} ${n.title} — ${when}`;
  }
  return { success: true, message: msg };
}

// ─── mark_expense_paid ───────────────────────────────────────────
async function handleMarkExpensePaid(
  data: Record<string, unknown>
): Promise<ActionResult> {
  const project = await resolveProject(data);
  if (!project)
    return { success: false, message: `לא מצאתי פרויקט "${data.project_name}".` };

  const supplierName = data.supplier_name ? String(data.supplier_name) : null;
  const amount = data.amount != null ? Number(data.amount) : null;

  let query = supabase
    .from("project_expenses")
    .select("id, supplier_name, amount, status")
    .eq("project_id", project.id)
    .eq("status", "unpaid")
    .order("invoice_date", { ascending: false });

  if (supplierName) query = query.ilike("supplier_name", `%${supplierName}%`);
  if (amount) query = query.eq("amount", amount);

  const { data: matches } = await query.limit(2);

  if (!matches || matches.length === 0)
    return {
      success: false,
      message: `לא מצאתי הוצאה לא משולמת בפרויקט ${project.name}${supplierName ? ` עבור ${supplierName}` : ""}.`,
    };

  if (matches.length > 1)
    return {
      success: false,
      message: `נמצאו ${matches.length} הוצאות לא משולמות שמתאימות — ציין סכום או ספק כדי להבחין.`,
    };

  const expense = matches[0];
  const { error } = await supabase
    .from("project_expenses")
    .update({ status: "paid" })
    .eq("id", expense.id);

  if (error) throw error;

  await logAction(
    "project",
    project.id,
    "expense_paid",
    `הוצאה סומנה כשולמה: ${expense.supplier_name} — ₪${Number(expense.amount).toLocaleString()}`,
    "whatsapp"
  );

  return {
    success: true,
    message: `✅ הוצאה סומנה כשולמה — ${expense.supplier_name} ₪${Number(expense.amount).toLocaleString()} בפרויקט ${project.name}.`,
  };
}

// ─── WhatsApp image (check) handler ──────────────────────────────
/**
 * Receive a check image via WhatsApp.
 *
 * If the caption mentions a tenant ("של יוסי כהן" / "צ'ק של יוסי") we
 * resolve them, scan the image with Claude Vision, and call the same
 * record-check-as-payment pipeline that the web upload uses (creates
 * the check, the payment, and auto-issues a receipt). The reply
 * summarises what was created.
 */
export async function handleWhatsAppCheckImage(params: {
  phone: string;
  imageUrl: string;
  caption: string;
  senderName?: string;
}): Promise<ActionResult> {
  const caption = params.caption || "";

  // Try to extract tenant name from caption.
  // Supported phrasings:
  //  "צ'ק של יוסי כהן"
  //  "של יוסי"
  //  "תשלום עבור יוסי כהן"
  //  bare name
  const nameMatch =
    caption.match(/(?:צ['׳]?ק|תשלום)\s+(?:של|עבור|מ-?)\s+(.+)/i) ||
    caption.match(/של\s+(.+)/i) ||
    caption.match(/עבור\s+(.+)/i);

  const tenantName = nameMatch?.[1]?.trim() || caption.trim();

  if (!tenantName) {
    return {
      success: false,
      message:
        "📸 קיבלתי תמונה אבל לא ידוע של מי הצ'ק. שלח שוב עם כיתוב כמו: \"צ'ק של יוסי כהן\".",
    };
  }

  const tenant = await resolveTenant({ tenant_name: tenantName });
  if (!tenant)
    return { success: false, message: `📸 לא מצאתי דייר בשם "${tenantName}". בדוק את האיות.` };
  if (!tenant.contract_id)
    return { success: false, message: `📸 ל${tenant.full_name} אין חוזה פעיל — לא ניתן לרשום צ'ק.` };

  // Scan the image
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const scanRes = await fetch(`${baseUrl}/api/checks/scan-from-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_urls: [params.imageUrl] }),
  });

  if (!scanRes.ok) {
    const err = await scanRes.text();
    return { success: false, message: `📸 שגיאה בסריקת התמונה: ${err.slice(0, 100)}` };
  }
  const { checks } = (await scanRes.json()) as {
    checks: {
      check_number: string | null;
      bank_name: string | null;
      branch_number: string | null;
      account_number: string | null;
      amount: number | null;
      due_date: string | null;
    }[];
  };

  if (!checks || checks.length === 0)
    return { success: false, message: "📸 לא הצלחתי לזהות פרטי צ'ק בתמונה." };

  let receiptCount = 0;
  let recordedCount = 0;
  const errors: string[] = [];

  for (const c of checks) {
    if (!c.check_number || !c.amount || !c.due_date) {
      errors.push("צ'ק חסר פרטים (מספר/סכום/תאריך)");
      continue;
    }
    try {
      const r = await recordCheckAsPayment({
        tenant_id: tenant.id,
        contract_id: tenant.contract_id!,
        check_number: c.check_number,
        bank_name: c.bank_name,
        branch_number: c.branch_number,
        account_number: c.account_number,
        amount: c.amount,
        due_date: c.due_date,
        for_month: dueDateToForMonth(c.due_date),
        source: "whatsapp_agent",
        image_url: params.imageUrl,
      });
      recordedCount++;
      if (r.receipt_doc_number) receiptCount++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  let msg = `📸 ${tenant.full_name}:\n`;
  msg += `• ${recordedCount} צ'קים נרשמו ושולבו בתשלומים\n`;
  if (receiptCount > 0) msg += `• ${receiptCount} קבלות הופקו אוטומטית\n`;
  if (errors.length > 0) msg += `• ${errors.length} שגיאות`;
  return { success: true, message: msg };
}
