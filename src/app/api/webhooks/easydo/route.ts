import { NextRequest, NextResponse } from "next/server";
import type { EasydoWebhookEvent } from "@/lib/api/easydo";

/**
 * EasyDo Webhook — triggered when a document is signed.
 *
 * After signing:
 * 1. Save PDF to Google Drive in tenant folder
 * 2. Update contract status to 'active'
 * 3. Update contract google_drive_url
 * 4. Create tenant record if new
 * 5. Generate payment schedule
 * 6. Update unit as occupied
 * 7. Log to action_logs
 * 8. Send welcome WhatsApp to tenant
 */
export async function POST(request: NextRequest) {
  try {
    const event: EasydoWebhookEvent = await request.json();

    console.log("EasyDo webhook received:", event.status, event.document_id);

    if (event.status === "signed") {
      // TODO: Implement full post-signing flow
      // 1. Get contract by easydo_document_id
      // const contract = await supabase.from('contracts')
      //   .select('*').eq('easydo_document_id', event.document_id).single();

      // 2. Download signed PDF from event.signed_pdf_url
      // 3. Upload to Google Drive
      // const driveUrl = await saveContractToDrive(tenant.full_name, pdfBuffer);

      // 4. Update contract status
      // await supabase.from('contracts').update({
      //   status: 'active',
      //   google_drive_url: driveUrl,
      // }).eq('easydo_document_id', event.document_id);

      // 5. Generate payment schedule
      // const schedule = generatePaymentSchedule(contract);
      // await supabase.from('payment_schedule').insert(schedule);

      // 6. Update unit
      // await supabase.from('units').update({ is_occupied: true }).eq('id', contract.unit_id);

      // 7. Log action
      // await supabase.from('action_logs').insert({...});

      // 8. Send WhatsApp welcome
      // await sendWhatsAppMessage(tenant.phone, `ברוך הבא! החוזה נחתם בהצלחה.`);

      console.log("Contract signed successfully:", event.document_id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("EasyDo webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
