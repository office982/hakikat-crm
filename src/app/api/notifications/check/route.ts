import { NextResponse } from "next/server";

/**
 * Notification Check — Cron Job
 * Runs daily at 08:00 via Vercel Cron.
 *
 * Checks:
 * 1. Contracts expiring in 45 days
 * 2. Contracts expiring in 30 days
 * 3. Tenants who haven't paid by the 10th
 * 4. Checks due in next 7 days
 * 5. Supplier invoices unpaid over 30 days
 */
export async function GET() {
  try {
    const today = new Date();
    const notifications = [];

    // TODO: Connect to Supabase when DB is ready
    // 1. Expiring contracts (45 days)
    // const expiring45 = await supabase.from('contracts')
    //   .select('*, tenants(*)')
    //   .eq('status', 'active')
    //   .lte('end_date', addDays(today, 45).toISOString())
    //   .gte('end_date', today.toISOString());

    // 2. Expiring contracts (30 days)
    // const expiring30 = await supabase.from('contracts')
    //   .select('*, tenants(*)')
    //   .eq('status', 'active')
    //   .lte('end_date', addDays(today, 30).toISOString())
    //   .gte('end_date', today.toISOString());

    // 3. Unpaid tenants (after 10th of month)
    // if (today.getDate() > 10) {
    //   const currentMonth = format(today, 'MM/yyyy');
    //   const unpaid = await supabase.from('payment_schedule')
    //     .select('*, tenants(*)')
    //     .eq('month_year', currentMonth)
    //     .eq('status', 'pending');
    // }

    // 4. Checks due in 7 days
    // const upcomingChecks = await supabase.from('checks')
    //   .select('*, tenants(*)')
    //   .eq('status', 'pending')
    //   .lte('due_date', addDays(today, 7).toISOString())
    //   .gte('due_date', today.toISOString());

    // 5. Unpaid supplier invoices > 30 days
    // const oldInvoices = await supabase.from('project_expenses')
    //   .select('*')
    //   .eq('status', 'unpaid')
    //   .lte('invoice_date', subDays(today, 30).toISOString());

    // Save notifications to DB
    // for (const n of notifications) {
    //   await supabase.from('notifications').insert(n);
    // }

    // Send urgent WhatsApp alerts to admin
    // for (const n of notifications.filter(n => n.type === 'missing_payment')) {
    //   await sendWhatsAppMessage(adminPhone, n.message);
    // }

    console.log(`[Cron] Notification check completed at ${today.toISOString()}`);

    return NextResponse.json({
      checked_at: today.toISOString(),
      notifications_created: notifications.length,
    });
  } catch (error) {
    console.error("Notification check error:", error);
    return NextResponse.json(
      { error: "Failed to check notifications" },
      { status: 500 }
    );
  }
}
