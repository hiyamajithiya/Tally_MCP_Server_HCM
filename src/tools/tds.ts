// TDS Tools for Income Tax Act Compliance
// Section-wise TDS calculation, Form 26Q/27Q data extraction

import { TallyConnection } from '../tally/connection.js';
import { TallyRequests } from '../tally/requests.js';
import { TDSTransaction, TDSSummary, Form26QData, TallyResponse } from '../types/tally.js';

// TDS Rate Master as per Income Tax Act (FY 2024-25)
export const TDS_RATES: Record<string, { section: string; nature: string; rate: number; threshold: number; description: string }> = {
  '192': { section: '192', nature: 'Salary', rate: 0, threshold: 0, description: 'Salary - As per slab rates' },
  '193': { section: '193', nature: 'Interest on Securities', rate: 10, threshold: 10000, description: 'Interest on securities' },
  '194': { section: '194', nature: 'Dividend', rate: 10, threshold: 5000, description: 'Dividend' },
  '194A': { section: '194A', nature: 'Interest other than securities', rate: 10, threshold: 40000, description: 'Interest other than interest on securities (Bank: 40000, Others: 5000)' },
  '194B': { section: '194B', nature: 'Lottery/Crossword Puzzle', rate: 30, threshold: 10000, description: 'Winnings from lottery, crossword puzzle' },
  '194BB': { section: '194BB', nature: 'Horse Race', rate: 30, threshold: 10000, description: 'Winnings from horse race' },
  '194C': { section: '194C', nature: 'Contractor', rate: 1, threshold: 30000, description: 'Payment to contractor (Individual/HUF: 1%, Others: 2%)' },
  '194C_COMPANY': { section: '194C', nature: 'Contractor (Company)', rate: 2, threshold: 30000, description: 'Payment to contractor (Company)' },
  '194D': { section: '194D', nature: 'Insurance Commission', rate: 5, threshold: 15000, description: 'Insurance commission' },
  '194DA': { section: '194DA', nature: 'Life Insurance Maturity', rate: 5, threshold: 100000, description: 'Payment in respect of life insurance policy' },
  '194E': { section: '194E', nature: 'Non-resident Sportsmen', rate: 20, threshold: 0, description: 'Payment to non-resident sportsmen/entertainer' },
  '194EE': { section: '194EE', nature: 'NSS Deposits', rate: 10, threshold: 2500, description: 'Payment in respect of NSS deposits' },
  '194F': { section: '194F', nature: 'Repurchase of UTI Units', rate: 20, threshold: 0, description: 'Payment on account of repurchase of units by UTI' },
  '194G': { section: '194G', nature: 'Lottery Commission', rate: 5, threshold: 15000, description: 'Commission on sale of lottery tickets' },
  '194H': { section: '194H', nature: 'Commission/Brokerage', rate: 5, threshold: 15000, description: 'Commission or brokerage' },
  '194I_LAND': { section: '194I', nature: 'Rent - Land/Building', rate: 10, threshold: 240000, description: 'Rent of land, building or furniture' },
  '194I_PLANT': { section: '194I', nature: 'Rent - Plant/Machinery', rate: 2, threshold: 240000, description: 'Rent of plant and machinery' },
  '194IA': { section: '194IA', nature: 'Immovable Property', rate: 1, threshold: 5000000, description: 'Payment for transfer of immovable property' },
  '194IB': { section: '194IB', nature: 'Rent by Individual/HUF', rate: 5, threshold: 50000, description: 'Rent payment by individual/HUF' },
  '194IC': { section: '194IC', nature: 'JDA Payment', rate: 10, threshold: 0, description: 'Payment under Joint Development Agreement' },
  '194J_PROFESSIONAL': { section: '194J', nature: 'Professional Fees', rate: 10, threshold: 30000, description: 'Professional fees' },
  '194J_TECHNICAL': { section: '194J', nature: 'Technical Services', rate: 2, threshold: 30000, description: 'Technical services (specified)' },
  '194J_ROYALTY': { section: '194J', nature: 'Royalty', rate: 10, threshold: 30000, description: 'Royalty' },
  '194K': { section: '194K', nature: 'Mutual Fund Units', rate: 10, threshold: 5000, description: 'Payment of dividend by mutual fund' },
  '194LA': { section: '194LA', nature: 'Compensation on Land', rate: 10, threshold: 250000, description: 'Compensation on acquisition of immovable property' },
  '194LB': { section: '194LB', nature: 'Infrastructure Debt Fund', rate: 5, threshold: 0, description: 'Income from infrastructure debt fund' },
  '194LC': { section: '194LC', nature: 'Foreign Currency Bonds', rate: 5, threshold: 0, description: 'Income by way of interest from Indian company' },
  '194LD': { section: '194LD', nature: 'Bond Interest (FII)', rate: 5, threshold: 0, description: 'Interest on certain bonds' },
  '194M': { section: '194M', nature: 'Commission to Individual', rate: 5, threshold: 5000000, description: 'Commission by individual/HUF' },
  '194N': { section: '194N', nature: 'Cash Withdrawal', rate: 2, threshold: 10000000, description: 'Cash withdrawal exceeding specified limit' },
  '194O': { section: '194O', nature: 'E-commerce Operator', rate: 1, threshold: 500000, description: 'Payment by e-commerce operator' },
  '194P': { section: '194P', nature: 'Senior Citizen TDS', rate: 0, threshold: 0, description: 'TDS on senior citizen' },
  '194Q': { section: '194Q', nature: 'Purchase of Goods', rate: 0.1, threshold: 5000000, description: 'TDS on purchase of goods' },
  '194R': { section: '194R', nature: 'Benefits/Perquisites', rate: 10, threshold: 20000, description: 'TDS on benefits/perquisites' },
  '194S': { section: '194S', nature: 'Virtual Digital Asset', rate: 1, threshold: 10000, description: 'TDS on virtual digital asset' },
  '195': { section: '195', nature: 'Non-resident', rate: 20, threshold: 0, description: 'Payment to non-resident' },
  '196A': { section: '196A', nature: 'Income from Units', rate: 20, threshold: 0, description: 'Income from units of mutual fund' },
  '196B': { section: '196B', nature: 'LTC on Units', rate: 10, threshold: 0, description: 'Income from units to offshore fund' },
  '196C': { section: '196C', nature: 'Income from Bonds', rate: 10, threshold: 0, description: 'Income from foreign currency bonds' },
  '196D': { section: '196D', nature: 'Income of FII', rate: 20, threshold: 0, description: 'Income of FIIs from securities' },
  '206C_TCS_SALE': { section: '206C', nature: 'TCS on Sale', rate: 1, threshold: 0, description: 'Tax collected at source on sale' },
};

export class TDSTools {
  private connection: TallyConnection;

  constructor(connection: TallyConnection) {
    this.connection = connection;
  }

  // Helper to safely extract string value from Tally XML property (handles #text objects)
  private extractString(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (value['#text'] !== undefined) return String(value['#text']);
    return '';
  }

  // Get all TDS transactions
  async getTDSTransactions(fromDate: string, toDate: string): Promise<TallyResponse<TDSTransaction[]>> {
    const xml = TallyRequests.getTDSTransactions(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const transactions: TDSTransaction[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        const tdsData = this.extractTDSData(voucher);
        if (tdsData) {
          transactions.push(tdsData);
        }
      }

      return { success: true, data: transactions };
    } catch (error: any) {
      return { success: false, error: `Failed to get TDS transactions: ${error.message}` };
    }
  }

  // Get TDS summary section-wise
  async getTDSSummary(fromDate: string, toDate: string): Promise<TallyResponse<TDSSummary[]>> {
    const transactionsResult = await this.getTDSTransactions(fromDate, toDate);
    if (!transactionsResult.success) {
      return { success: false, error: transactionsResult.error };
    }

    try {
      const sectionWise: Record<string, TDSSummary> = {};

      for (const txn of transactionsResult.data!) {
        const key = `${txn.section}_${txn.nature}`;

        if (!sectionWise[key]) {
          sectionWise[key] = {
            section: txn.section,
            nature: txn.nature,
            totalPayments: 0,
            totalTDSDeducted: 0,
            totalTDSDeposited: 0,
            pendingTDS: 0,
            transactions: [],
          };
        }

        sectionWise[key].totalPayments += txn.paymentAmount;
        sectionWise[key].totalTDSDeducted += txn.totalTDS;
        if (txn.isChallanDeposited) {
          sectionWise[key].totalTDSDeposited += txn.totalTDS;
        }
        sectionWise[key].transactions.push(txn);
      }

      // Calculate pending TDS
      for (const summary of Object.values(sectionWise)) {
        summary.pendingTDS = summary.totalTDSDeducted - summary.totalTDSDeposited;
      }

      return { success: true, data: Object.values(sectionWise) };
    } catch (error: any) {
      return { success: false, error: `Failed to generate TDS summary: ${error.message}` };
    }
  }

  // Get Form 26Q data (Quarterly TDS return for non-salary)
  async getForm26QData(quarter: string, financialYear: string): Promise<TallyResponse<Form26QData>> {
    const { fromDate, toDate } = this.getQuarterDates(quarter, financialYear);

    const transactionsResult = await this.getTDSTransactions(fromDate, toDate);
    if (!transactionsResult.success) {
      return { success: false, error: transactionsResult.error };
    }

    // Get company details
    const companyResult = await this.connection.getCompanyList();
    const company = companyResult.data?.find((c) => c.name === this.connection.getCompanyName());

    try {
      const form26Q: Form26QData = {
        quarter,
        financialYear,
        deductorTAN: company?.tanNumber || '',
        deductorPAN: company?.panNumber || '',
        deductorName: company?.name || '',
        transactions: transactionsResult.data!.filter(
          (txn) => txn.section !== '192' // Exclude salary TDS (that goes in 24Q)
        ),
        challanDetails: [],
      };

      // Group challan details
      const challanMap = new Map<string, any>();
      for (const txn of form26Q.transactions) {
        if (txn.challanNumber) {
          const key = txn.challanNumber;
          if (!challanMap.has(key)) {
            challanMap.set(key, {
              challanNumber: txn.challanNumber,
              depositDate: txn.challanDate || '',
              bsrCode: txn.bsrCode || '',
              amount: 0,
              section: txn.section,
            });
          }
          challanMap.get(key).amount += txn.totalTDS;
        }
      }

      form26Q.challanDetails = Array.from(challanMap.values());

      return { success: true, data: form26Q };
    } catch (error: any) {
      return { success: false, error: `Failed to generate Form 26Q data: ${error.message}` };
    }
  }

  // Get Form 24Q data (Quarterly TDS return for salary)
  async getForm24QData(quarter: string, financialYear: string): Promise<TallyResponse<any>> {
    const { fromDate, toDate } = this.getQuarterDates(quarter, financialYear);

    const transactionsResult = await this.getTDSTransactions(fromDate, toDate);
    if (!transactionsResult.success) return transactionsResult;

    const companyResult = await this.connection.getCompanyList();
    const company = companyResult.data?.find((c) => c.name === this.connection.getCompanyName());

    try {
      const salaryTransactions = transactionsResult.data!.filter((txn) => txn.section === '192');

      const form24Q = {
        quarter,
        financialYear,
        deductorTAN: company?.tanNumber || '',
        deductorPAN: company?.panNumber || '',
        deductorName: company?.name || '',
        employeeWise: this.groupByEmployee(salaryTransactions),
        summary: {
          totalSalary: salaryTransactions.reduce((sum, t) => sum + t.paymentAmount, 0),
          totalTDSDeducted: salaryTransactions.reduce((sum, t) => sum + t.totalTDS, 0),
          employeeCount: new Set(salaryTransactions.map((t) => t.deducteePAN)).size,
        },
      };

      return { success: true, data: form24Q };
    } catch (error: any) {
      return { success: false, error: `Failed to generate Form 24Q data: ${error.message}` };
    }
  }

  // Get Form 27Q data (TDS on payments to non-residents)
  async getForm27QData(quarter: string, financialYear: string): Promise<TallyResponse<any>> {
    const { fromDate, toDate } = this.getQuarterDates(quarter, financialYear);

    const transactionsResult = await this.getTDSTransactions(fromDate, toDate);
    if (!transactionsResult.success) return transactionsResult;

    const companyResult = await this.connection.getCompanyList();
    const company = companyResult.data?.find((c) => c.name === this.connection.getCompanyName());

    try {
      // Filter non-resident transactions (Section 195, 196A, 196B, 196C, 196D)
      const nrSections = ['195', '196A', '196B', '196C', '196D'];
      const nrTransactions = transactionsResult.data!.filter((txn) =>
        nrSections.includes(txn.section)
      );

      const form27Q = {
        quarter,
        financialYear,
        deductorTAN: company?.tanNumber || '',
        deductorPAN: company?.panNumber || '',
        deductorName: company?.name || '',
        transactions: nrTransactions,
        summary: {
          totalPayments: nrTransactions.reduce((sum, t) => sum + t.paymentAmount, 0),
          totalTDSDeducted: nrTransactions.reduce((sum, t) => sum + t.totalTDS, 0),
          transactionCount: nrTransactions.length,
        },
      };

      return { success: true, data: form27Q };
    } catch (error: any) {
      return { success: false, error: `Failed to generate Form 27Q data: ${error.message}` };
    }
  }

  // Check TDS compliance - identify non-deductions and short deductions
  async checkTDSCompliance(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Get all payment vouchers
    const paymentXml = TallyRequests.getPaymentVouchers(formattedFromDate, formattedToDate, companyName);
    const paymentResponse = await this.connection.executeRequest(paymentXml);

    // Get journal vouchers (expense provisions)
    const journalXml = TallyRequests.getJournalVouchers(formattedFromDate, formattedToDate, companyName);
    const journalResponse = await this.connection.executeRequest(journalXml);

    try {
      const compliance = {
        nonDeductionCases: [] as any[],
        shortDeductionCases: [] as any[],
        lateDeductionCases: [] as any[],
        correctDeductions: [] as any[],
        summary: {
          totalPaymentsChecked: 0,
          totalNonDeductions: 0,
          totalShortDeductions: 0,
          potentialInterest: 0,
        },
      };

      const allVouchers = [
        ...(paymentResponse.success ? this.extractVouchers(paymentResponse.data) : []),
        ...(journalResponse.success ? this.extractVouchers(journalResponse.data) : []),
      ];

      for (const voucher of allVouchers) {
        const ledgerEntries = this.extractLedgerEntries(voucher);

        for (const entry of ledgerEntries) {
          const ledgerName = this.extractString(entry.LEDGERNAME).toLowerCase();
          const parent = this.extractString(entry.PARENT).toLowerCase();
          const amount = Math.abs(this.connection.parseAmount(entry.AMOUNT));

          // Identify TDS applicable transactions
          const tdsApplicability = this.checkTDSApplicability(ledgerName, parent, amount);

          if (tdsApplicability.applicable) {
            compliance.summary.totalPaymentsChecked++;

            const actualTDS = this.connection.parseAmount(entry.TDSAMOUNT || 0);
            const expectedTDS = amount * (tdsApplicability.rate / 100);

            if (actualTDS === 0 && amount > tdsApplicability.threshold) {
              // Non-deduction case
              compliance.nonDeductionCases.push({
                date: this.connection.parseDate(voucher.DATE),
                voucherNumber: voucher.VOUCHERNUMBER,
                partyName: voucher.PARTYLEDGERNAME,
                ledgerName: entry.LEDGERNAME,
                amount: amount,
                expectedSection: tdsApplicability.section,
                expectedRate: tdsApplicability.rate,
                expectedTDS: expectedTDS,
                actualTDS: 0,
                shortfall: expectedTDS,
                interestApplicable: this.calculateInterest(expectedTDS, voucher.DATE),
              });
              compliance.summary.totalNonDeductions++;
            } else if (actualTDS > 0 && actualTDS < expectedTDS - 1) {
              // Short deduction case (allowing Re. 1 tolerance)
              compliance.shortDeductionCases.push({
                date: this.connection.parseDate(voucher.DATE),
                voucherNumber: voucher.VOUCHERNUMBER,
                partyName: voucher.PARTYLEDGERNAME,
                ledgerName: entry.LEDGERNAME,
                amount: amount,
                expectedSection: tdsApplicability.section,
                expectedRate: tdsApplicability.rate,
                expectedTDS: expectedTDS,
                actualTDS: actualTDS,
                shortfall: expectedTDS - actualTDS,
                interestApplicable: this.calculateInterest(expectedTDS - actualTDS, voucher.DATE),
              });
              compliance.summary.totalShortDeductions++;
            } else {
              compliance.correctDeductions.push({
                date: this.connection.parseDate(voucher.DATE),
                voucherNumber: voucher.VOUCHERNUMBER,
                partyName: voucher.PARTYLEDGERNAME,
                amount: amount,
                section: tdsApplicability.section,
                tdsAmount: actualTDS,
              });
            }
          }
        }
      }

      // Calculate total potential interest
      compliance.summary.potentialInterest =
        compliance.nonDeductionCases.reduce((sum, c) => sum + c.interestApplicable, 0) +
        compliance.shortDeductionCases.reduce((sum, c) => sum + c.interestApplicable, 0);

      return { success: true, data: compliance };
    } catch (error: any) {
      return { success: false, error: `Failed to check TDS compliance: ${error.message}` };
    }
  }

  // Get TDS payable ledger balances
  async getTDSPayable(asOnDate: string): Promise<TallyResponse<any>> {
    const xml = TallyRequests.getTDSPayableReport(
      this.connection.formatTallyDate(new Date('2000-04-01')), // From beginning
      this.connection.formatTallyDate(new Date(asOnDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const tdsPayable: any[] = [];
      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);
        if (balance !== 0) {
          const section = this.extractSectionFromLedgerName(ledger.NAME || '');
          tdsPayable.push({
            ledgerName: ledger.NAME,
            section: section,
            balance: balance,
            type: balance > 0 ? 'Payable' : 'Refundable',
          });
        }
      }

      const totalPayable = tdsPayable.filter((l) => l.balance > 0).reduce((sum, l) => sum + l.balance, 0);
      const totalRefundable = tdsPayable.filter((l) => l.balance < 0).reduce((sum, l) => sum + Math.abs(l.balance), 0);

      return {
        success: true,
        data: {
          ledgers: tdsPayable,
          summary: {
            totalPayable,
            totalRefundable,
            netPayable: totalPayable - totalRefundable,
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get TDS payable: ${error.message}` };
    }
  }

  // Get party-wise TDS details (for Form 16/16A generation)
  async getPartyWiseTDS(
    fromDate: string,
    toDate: string,
    partyPAN?: string
  ): Promise<TallyResponse<any[]>> {
    const transactionsResult = await this.getTDSTransactions(fromDate, toDate);
    if (!transactionsResult.success) return transactionsResult;

    try {
      const partyWise: Record<string, any> = {};

      for (const txn of transactionsResult.data!) {
        if (partyPAN && txn.deducteePAN !== partyPAN) continue;

        const key = txn.deducteePAN || txn.deducteeName;
        if (!partyWise[key]) {
          partyWise[key] = {
            deducteeName: txn.deducteeName,
            deducteePAN: txn.deducteePAN,
            transactions: [],
            totalPayments: 0,
            totalTDS: 0,
            sectionWise: {} as Record<string, { payments: number; tds: number }>,
          };
        }

        partyWise[key].transactions.push(txn);
        partyWise[key].totalPayments += txn.paymentAmount;
        partyWise[key].totalTDS += txn.totalTDS;

        // Section-wise breakup
        if (!partyWise[key].sectionWise[txn.section]) {
          partyWise[key].sectionWise[txn.section] = { payments: 0, tds: 0 };
        }
        partyWise[key].sectionWise[txn.section].payments += txn.paymentAmount;
        partyWise[key].sectionWise[txn.section].tds += txn.totalTDS;
      }

      return { success: true, data: Object.values(partyWise) };
    } catch (error: any) {
      return { success: false, error: `Failed to get party-wise TDS: ${error.message}` };
    }
  }

  // Get TDS rates reference
  getTDSRates(): TallyResponse<typeof TDS_RATES> {
    return { success: true, data: TDS_RATES };
  }

  // Calculate TDS for a given payment
  calculateTDS(
    section: string,
    amount: number,
    hasPAN: boolean = true
  ): TallyResponse<{ tdsAmount: number; rate: number; surcharge: number; cess: number; total: number }> {
    const rateInfo = TDS_RATES[section];
    if (!rateInfo) {
      return { success: false, error: `Unknown TDS section: ${section}` };
    }

    // Check threshold
    if (amount < rateInfo.threshold) {
      return {
        success: true,
        data: { tdsAmount: 0, rate: 0, surcharge: 0, cess: 0, total: 0 },
      };
    }

    // Higher rate (20%) if no PAN - Section 206AA
    let rate = hasPAN ? rateInfo.rate : Math.max(rateInfo.rate, 20);

    const tdsAmount = (amount * rate) / 100;

    // Surcharge and Cess (for non-residents)
    let surcharge = 0;
    let cess = 0;

    if (section.startsWith('19') && section.length === 3) {
      // For non-resident sections, apply surcharge if applicable
      if (amount > 10000000) {
        surcharge = tdsAmount * 0.15; // 15% surcharge
      } else if (amount > 5000000) {
        surcharge = tdsAmount * 0.10; // 10% surcharge
      }
      cess = (tdsAmount + surcharge) * 0.04; // 4% Health and Education Cess
    }

    return {
      success: true,
      data: {
        tdsAmount,
        rate,
        surcharge,
        cess,
        total: tdsAmount + surcharge + cess,
      },
    };
  }

  // Private helper methods
  private extractTDSData(voucher: any): TDSTransaction | null {
    const ledgerEntries = this.extractLedgerEntries(voucher);
    let tdsEntry: any = null;
    let paymentEntry: any = null;

    for (const entry of ledgerEntries) {
      if (entry.TDSSECTION || entry.TDSNATURE) {
        tdsEntry = entry;
      } else if (this.connection.parseAmount(entry.AMOUNT) > 0) {
        paymentEntry = entry;
      }
    }

    if (!tdsEntry && !paymentEntry) return null;

    const entry = tdsEntry || paymentEntry;
    const tdsAmount = this.connection.parseAmount(entry.TDSAMOUNT || tdsEntry?.AMOUNT || 0);
    const paymentAmount = Math.abs(this.connection.parseAmount(paymentEntry?.AMOUNT || voucher.AMOUNT || 0));

    return {
      date: this.connection.parseDate(voucher.DATE),
      voucherNumber: voucher.VOUCHERNUMBER || '',
      deducteeName: voucher.PARTYLEDGERNAME || '',
      deducteePAN: entry.INCOMETAXNUMBER || voucher.PARTYINCOMETAXNUMBER || '',
      section: entry.TDSSECTION || '',
      nature: entry.TDSNATURE || '',
      paymentAmount: paymentAmount,
      tdsRate: this.connection.parseAmount(entry.TDSRATE || 0),
      tdsAmount: Math.abs(tdsAmount),
      surcharge: 0,
      educationCess: 0,
      totalTDS: Math.abs(tdsAmount),
      isChallanDeposited: !!voucher.CHALLANNUMBER,
      challanNumber: voucher.CHALLANNUMBER || '',
      challanDate: voucher.CHALLANDATE || '',
      bsrCode: voucher.BSRCODE || '',
    };
  }

  private checkTDSApplicability(
    ledgerName: string,
    parent: string,
    amount: number
  ): { applicable: boolean; section: string; rate: number; threshold: number } {
    // Default - not applicable
    const result = { applicable: false, section: '', rate: 0, threshold: 0 };

    // Check based on ledger parent/name for common cases
    if (parent.includes('indirect expenses') || parent.includes('direct expenses')) {
      // Professional fees
      if (ledgerName.includes('professional') || ledgerName.includes('consultancy') || ledgerName.includes('legal')) {
        return { applicable: true, section: '194J', rate: 10, threshold: 30000 };
      }

      // Technical fees
      if (ledgerName.includes('technical') || ledgerName.includes('software')) {
        return { applicable: true, section: '194J', rate: 2, threshold: 30000 };
      }

      // Contractor
      if (ledgerName.includes('contractor') || ledgerName.includes('labour') || ledgerName.includes('job work')) {
        return { applicable: true, section: '194C', rate: 1, threshold: 30000 };
      }

      // Commission
      if (ledgerName.includes('commission') || ledgerName.includes('brokerage')) {
        return { applicable: true, section: '194H', rate: 5, threshold: 15000 };
      }

      // Rent
      if (ledgerName.includes('rent')) {
        if (ledgerName.includes('plant') || ledgerName.includes('machinery')) {
          return { applicable: true, section: '194I', rate: 2, threshold: 240000 };
        }
        return { applicable: true, section: '194I', rate: 10, threshold: 240000 };
      }

      // Interest
      if (ledgerName.includes('interest')) {
        return { applicable: true, section: '194A', rate: 10, threshold: 5000 };
      }
    }

    return result;
  }

  private calculateInterest(tdsAmount: number, deductionDate: string): number {
    // Interest u/s 201(1A) - 1% per month from date of deduction to date of deposit
    // For simplicity, calculating from deduction date to current date
    const deductDate = new Date(deductionDate);
    const today = new Date();
    const months = Math.ceil((today.getTime() - deductDate.getTime()) / (30 * 24 * 60 * 60 * 1000));

    return (tdsAmount * months * 1) / 100;
  }

  private extractSectionFromLedgerName(name: string): string {
    const sections = ['192', '194A', '194C', '194H', '194I', '194J', '194Q', '195'];
    for (const section of sections) {
      if (name.includes(section)) return section;
    }

    // Try to identify from description
    const nameLower = name.toLowerCase();
    if (nameLower.includes('salary')) return '192';
    if (nameLower.includes('interest')) return '194A';
    if (nameLower.includes('contractor')) return '194C';
    if (nameLower.includes('commission')) return '194H';
    if (nameLower.includes('rent')) return '194I';
    if (nameLower.includes('professional') || nameLower.includes('technical')) return '194J';

    return 'Unknown';
  }

  private getQuarterDates(quarter: string, financialYear: string): { fromDate: string; toDate: string } {
    const [startYear] = financialYear.split('-').map(Number);

    const quarters: Record<string, { fromDate: string; toDate: string }> = {
      Q1: { fromDate: `${startYear}-04-01`, toDate: `${startYear}-06-30` },
      Q2: { fromDate: `${startYear}-07-01`, toDate: `${startYear}-09-30` },
      Q3: { fromDate: `${startYear}-10-01`, toDate: `${startYear}-12-31` },
      Q4: { fromDate: `${startYear + 1}-01-01`, toDate: `${startYear + 1}-03-31` },
    };

    return quarters[quarter] || quarters.Q1;
  }

  private groupByEmployee(transactions: TDSTransaction[]): any[] {
    const employeeMap = new Map<string, any>();

    for (const txn of transactions) {
      const key = txn.deducteePAN || txn.deducteeName;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employeeName: txn.deducteeName,
          employeePAN: txn.deducteePAN,
          totalSalary: 0,
          totalTDS: 0,
          months: [],
        });
      }

      const emp = employeeMap.get(key);
      emp.totalSalary += txn.paymentAmount;
      emp.totalTDS += txn.totalTDS;
      emp.months.push({
        date: txn.date,
        salary: txn.paymentAmount,
        tds: txn.totalTDS,
      });
    }

    return Array.from(employeeMap.values());
  }

  private extractVouchers(data: any): any[] {
    const envelope = data?.ENVELOPE;
    const voucherData = envelope?.BODY?.DATA?.COLLECTION?.VOUCHER || envelope?.BODY?.DATA?.TALLYMESSAGE?.VOUCHER;
    if (!voucherData) return [];
    return Array.isArray(voucherData) ? voucherData : [voucherData];
  }

  private extractLedgerEntries(voucher: any): any[] {
    const entries = voucher['ALLLEDGERENTRIES.LIST'] || voucher.ALLLEDGERENTRIES || voucher.LEDGERENTRIES;
    if (!entries) return [];
    return Array.isArray(entries) ? entries : [entries];
  }

  private extractLedgers(data: any): any[] {
    const envelope = data?.ENVELOPE;
    const ledgerData = envelope?.BODY?.DATA?.COLLECTION?.LEDGER;
    if (!ledgerData) return [];
    return Array.isArray(ledgerData) ? ledgerData : [ledgerData];
  }
}
