import { NextRequest, NextResponse } from "next/server";
import { generateContractText } from "@/lib/api/claude";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      tenant_name,
      id_number,
      unit,
      property,
      start_date,
      end_date,
      monthly_rent,
      annual_increase,
      building_fee,
      arnona,
      ai_instructions,
      entity_name,
    } = body;

    if (!tenant_name || !unit || !start_date || !end_date || !monthly_rent) {
      return NextResponse.json(
        { error: "שדות חובה חסרים" },
        { status: 400 }
      );
    }

    const contractText = await generateContractText({
      tenant_name,
      id_number,
      unit,
      property,
      start_date,
      end_date,
      monthly_rent,
      annual_increase: annual_increase || 0,
      building_fee: building_fee || 0,
      arnona: arnona || 0,
      ai_instructions,
      entity_name,
    });

    return NextResponse.json({
      contract_text: contractText,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Contract generation error:", error);
    return NextResponse.json(
      { error: "שגיאה ביצירת החוזה", details: String(error) },
      { status: 500 }
    );
  }
}
