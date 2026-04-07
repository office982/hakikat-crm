import { addMonths, differenceInMonths, format } from "date-fns";

export interface PaymentScheduleRow {
  month_year: string;
  due_date: string;
  expected_amount: number;
  year_number: number;
  status: "pending";
}

export interface ContractTerms {
  start_date: string;
  end_date: string;
  monthly_rent: number;
  annual_increase_percent: number;
}

/**
 * Generate a full payment schedule with annual rent increases.
 * Year 1 = base rent, Year 2+ = compounded by annual_increase_percent.
 */
export function generatePaymentSchedule(terms: ContractTerms): PaymentScheduleRow[] {
  const schedule: PaymentScheduleRow[] = [];
  const startDate = new Date(terms.start_date);
  const endDate = new Date(terms.end_date);
  let currentDate = new Date(startDate);
  const contractStart = new Date(startDate);

  while (currentDate <= endDate) {
    const monthsFromStart = differenceInMonths(currentDate, contractStart);
    const yearNumber = Math.floor(monthsFromStart / 12) + 1;

    const rentForYear =
      terms.monthly_rent *
      Math.pow(1 + terms.annual_increase_percent / 100, yearNumber - 1);

    schedule.push({
      month_year: format(currentDate, "MM/yyyy"),
      due_date: format(currentDate, "yyyy-MM-01"),
      expected_amount: Math.round(rentForYear),
      year_number: yearNumber,
      status: "pending",
    });

    currentDate = addMonths(currentDate, 1);
  }

  return schedule;
}

/**
 * Calculate rent for each year of the contract.
 */
export function getRentByYear(
  monthlyRent: number,
  annualIncrease: number,
  years: number
): { year: number; rent: number }[] {
  const result = [];
  for (let y = 1; y <= years; y++) {
    result.push({
      year: y,
      rent: Math.round(monthlyRent * Math.pow(1 + annualIncrease / 100, y - 1)),
    });
  }
  return result;
}

/**
 * Calculate total contract value.
 */
export function calculateContractTotal(schedule: PaymentScheduleRow[]): number {
  return schedule.reduce((sum, row) => sum + row.expected_amount, 0);
}
