// Tax Audit Tools for Section 44AB Compliance
// Form 3CD Clause-wise data extraction

import { TallyConnection } from '../tally/connection.js';
import { TallyRequests } from '../tally/requests.js';
import { TaxAuditData, CashTransaction, TallyResponse } from '../types/tally.js';

export class TaxAuditTools {
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

  // Clause 17(a) - Cash transactions exceeding prescribed limits
  async getCashTransactionsAboveLimit(
    fromDate: string,
    toDate: string,
    limit: number = 10000
  ): Promise<TallyResponse<TaxAuditData>> {
    const xml = TallyRequests.getCashTransactionsAboveLimit(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      limit,
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const transactions: CashTransaction[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        const amount = Math.abs(this.connection.parseAmount(voucher.AMOUNT));
        if (amount > limit) {
          transactions.push({
            date: this.connection.parseDate(voucher.DATE),
            voucherNumber: voucher.VOUCHERNUMBER || '',
            partyName: voucher.PARTYLEDGERNAME || '',
            amount: amount,
            narration: voucher.NARRATION || '',
            isReceipt: voucher.VOUCHERTYPENAME === 'Receipt',
          });
        }
      }

      return {
        success: true,
        data: {
          clause: '17(a)',
          description: `Cash payments/receipts exceeding Rs. ${limit.toLocaleString('en-IN')}`,
          data: transactions,
          remarks: `Total ${transactions.length} transactions found exceeding the limit`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to process cash transactions: ${error.message}` };
    }
  }

  // Clause 20(b) - Payments above Rs. 10,000 in cash (Section 40A(3))
  async getSection40A3Violations(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    const xml = TallyRequests.getCashTransactionsAboveLimit(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      10000,
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const violations: any[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        // Only payments, not receipts
        if (voucher.VOUCHERTYPENAME === 'Payment' || voucher.VOUCHERTYPENAME === 'Purchase') {
          const amount = Math.abs(this.connection.parseAmount(voucher.AMOUNT));
          if (amount > 10000) {
            // Check if cash ledger is involved
            const ledgerEntries = this.extractLedgerEntries(voucher);
            const hasCash = ledgerEntries.some(
              (entry: any) => entry.PARENT === 'Cash-in-Hand' || this.extractString(entry.LEDGERNAME).toLowerCase().includes('cash')
            );

            if (hasCash) {
              violations.push({
                date: this.connection.parseDate(voucher.DATE),
                voucherNumber: voucher.VOUCHERNUMBER || '',
                partyName: voucher.PARTYLEDGERNAME || '',
                amount: amount,
                narration: voucher.NARRATION || '',
                voucherType: voucher.VOUCHERTYPENAME,
                disallowanceAmount: amount, // Full amount is disallowed
              });
            }
          }
        }
      }

      const totalDisallowance = violations.reduce((sum, v) => sum + v.disallowanceAmount, 0);

      return {
        success: true,
        data: {
          clause: '20(b)',
          description: 'Payments exceeding Rs. 10,000 made in cash - Section 40A(3) violations',
          data: violations,
          remarks: `Total disallowance under Section 40A(3): Rs. ${totalDisallowance.toLocaleString('en-IN')}`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to process 40A(3) violations: ${error.message}` };
    }
  }

  // Clause 21(b) - TDS compliance check
  async getTDSComplianceReport(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    const xml = TallyRequests.getTDSTransactions(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const tdsReport: any = {
        sectionalSummary: [],
        nonDeductionCases: [],
        shortDeductionCases: [],
        lateDeductionCases: [],
      };

      const vouchers = this.extractVouchers(response.data);

      // Group by TDS section
      const sectionWise: Record<string, any[]> = {};

      for (const voucher of vouchers) {
        const ledgerEntries = this.extractLedgerEntries(voucher);
        for (const entry of ledgerEntries) {
          if (entry.TDSSECTION) {
            const section = entry.TDSSECTION;
            if (!sectionWise[section]) {
              sectionWise[section] = [];
            }
            sectionWise[section].push({
              date: this.connection.parseDate(voucher.DATE),
              voucherNumber: voucher.VOUCHERNUMBER,
              partyName: voucher.PARTYLEDGERNAME,
              paymentAmount: Math.abs(this.connection.parseAmount(entry.AMOUNT)),
              tdsRate: entry.TDSRATE || 0,
              tdsAmount: entry.TDSAMOUNT || 0,
              nature: entry.TDSNATURE || '',
            });
          }
        }
      }

      for (const [section, transactions] of Object.entries(sectionWise)) {
        const totalPayment = transactions.reduce((sum, t) => sum + t.paymentAmount, 0);
        const totalTDS = transactions.reduce((sum, t) => sum + t.tdsAmount, 0);

        tdsReport.sectionalSummary.push({
          section,
          totalPayments: totalPayment,
          totalTDSDeducted: totalTDS,
          transactionCount: transactions.length,
          transactions,
        });
      }

      return {
        success: true,
        data: {
          clause: '21(b)',
          description: 'TDS deduction compliance under various sections',
          data: tdsReport,
          remarks: `Total ${tdsReport.sectionalSummary.length} TDS sections found with transactions`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to process TDS compliance: ${error.message}` };
    }
  }

  // Clause 26 - Quantitative details of principal items
  async getQuantitativeDetails(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    const xml = TallyRequests.getStockSummary(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const stockItems: any[] = [];

      // Also fetch stock items for detailed breakdown
      const stockXml = TallyRequests.getStockItems(this.connection.getCompanyName());
      const stockResponse = await this.connection.executeRequest(stockXml);

      if (stockResponse.success) {
        const items = this.extractStockItems(stockResponse.data);
        for (const item of items) {
          stockItems.push({
            itemName: item.NAME || '',
            hsnCode: item.HSNCODE || '',
            unit: item.BASEUNITS || '',
            openingQty: this.connection.parseAmount(item.OPENINGBALANCE),
            openingValue: this.connection.parseAmount(item.OPENINGVALUE),
            closingQty: this.connection.parseAmount(item.CLOSINGBALANCE),
            closingValue: this.connection.parseAmount(item.CLOSINGVALUE),
          });
        }
      }

      return {
        success: true,
        data: {
          clause: '26',
          description: 'Quantitative details of principal items of goods traded',
          data: stockItems,
          remarks: `Total ${stockItems.length} stock items found`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to process quantitative details: ${error.message}` };
    }
  }

  // Clause 27(a) - Ratio Analysis
  async getRatioAnalysis(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Fetch Trial Balance for calculations
    const tbXml = TallyRequests.getTrialBalance(formattedFromDate, formattedToDate, companyName);
    const tbResponse = await this.connection.executeRequest(tbXml);

    if (!tbResponse.success) return tbResponse;

    try {
      // Extract key figures for ratio calculation
      const ratios: Record<string, number | string> = {};

      // These would be calculated from the trial balance data
      // For now, we'll return a structure that can be populated

      ratios.grossProfitRatio = 'To be calculated from P&L';
      ratios.netProfitRatio = 'To be calculated from P&L';
      ratios.stockTurnoverRatio = 'Opening Stock + Purchases - Closing Stock / Average Stock';
      ratios.debtorsTurnoverRatio = 'Credit Sales / Average Debtors';

      return {
        success: true,
        data: {
          clause: '27(a)',
          description: 'Ratio Analysis for Tax Audit',
          data: ratios,
          remarks: 'Key financial ratios for Form 3CD',
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to calculate ratios: ${error.message}` };
    }
  }

  // Clause 30A - Primary adjustment to transfer price
  async getRelatedPartyTransactions(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    // This requires custom TDL or party categorization
    return {
      success: true,
      data: {
        clause: '30A',
        description: 'Related Party Transactions',
        data: [],
        remarks: 'Requires party-wise categorization and manual identification',
      },
    };
  }

  // Clause 31 - GST Compliance
  async getGSTComplianceSummary(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Get GST Sales Register
    const salesXml = TallyRequests.getGSTSalesRegister(formattedFromDate, formattedToDate, companyName);
    const salesResponse = await this.connection.executeRequest(salesXml);

    // Get GST Purchase Register
    const purchaseXml = TallyRequests.getGSTPurchaseRegister(formattedFromDate, formattedToDate, companyName);
    const purchaseResponse = await this.connection.executeRequest(purchaseXml);

    try {
      const gstSummary: any = {
        outputGST: {
          igst: 0,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total: 0,
        },
        inputGST: {
          igst: 0,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total: 0,
        },
        netLiability: {
          igst: 0,
          cgst: 0,
          sgst: 0,
          cess: 0,
          total: 0,
        },
      };

      // Process sales for output GST
      if (salesResponse.success) {
        const salesVouchers = this.extractVouchers(salesResponse.data);
        for (const voucher of salesVouchers) {
          const ledgerEntries = this.extractLedgerEntries(voucher);
          for (const entry of ledgerEntries) {
            const ledgerName = this.extractString(entry.LEDGERNAME).toLowerCase();
            const amount = Math.abs(this.connection.parseAmount(entry.AMOUNT));

            if (ledgerName.includes('igst')) gstSummary.outputGST.igst += amount;
            else if (ledgerName.includes('cgst')) gstSummary.outputGST.cgst += amount;
            else if (ledgerName.includes('sgst')) gstSummary.outputGST.sgst += amount;
            else if (ledgerName.includes('cess')) gstSummary.outputGST.cess += amount;
          }
        }
      }

      // Process purchases for input GST
      if (purchaseResponse.success) {
        const purchaseVouchers = this.extractVouchers(purchaseResponse.data);
        for (const voucher of purchaseVouchers) {
          const ledgerEntries = this.extractLedgerEntries(voucher);
          for (const entry of ledgerEntries) {
            const ledgerName = this.extractString(entry.LEDGERNAME).toLowerCase();
            const amount = Math.abs(this.connection.parseAmount(entry.AMOUNT));

            if (ledgerName.includes('igst')) gstSummary.inputGST.igst += amount;
            else if (ledgerName.includes('cgst')) gstSummary.inputGST.cgst += amount;
            else if (ledgerName.includes('sgst')) gstSummary.inputGST.sgst += amount;
            else if (ledgerName.includes('cess')) gstSummary.inputGST.cess += amount;
          }
        }
      }

      // Calculate totals
      gstSummary.outputGST.total =
        gstSummary.outputGST.igst +
        gstSummary.outputGST.cgst +
        gstSummary.outputGST.sgst +
        gstSummary.outputGST.cess;

      gstSummary.inputGST.total =
        gstSummary.inputGST.igst +
        gstSummary.inputGST.cgst +
        gstSummary.inputGST.sgst +
        gstSummary.inputGST.cess;

      // Calculate net liability
      gstSummary.netLiability.igst = gstSummary.outputGST.igst - gstSummary.inputGST.igst;
      gstSummary.netLiability.cgst = gstSummary.outputGST.cgst - gstSummary.inputGST.cgst;
      gstSummary.netLiability.sgst = gstSummary.outputGST.sgst - gstSummary.inputGST.sgst;
      gstSummary.netLiability.cess = gstSummary.outputGST.cess - gstSummary.inputGST.cess;
      gstSummary.netLiability.total = gstSummary.outputGST.total - gstSummary.inputGST.total;

      return {
        success: true,
        data: {
          clause: '31',
          description: 'GST Compliance Summary for Tax Audit',
          data: gstSummary,
          remarks: `Net GST Liability: Rs. ${gstSummary.netLiability.total.toLocaleString('en-IN')}`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to process GST compliance: ${error.message}` };
    }
  }

  // Clause 32 - Loans and Deposits
  async getLoansAndDeposits(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    const xml = TallyRequests.getLoanAndAdvances(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const loans: any[] = [];
      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        loans.push({
          name: ledger.NAME || '',
          panNumber: ledger.INCOMETAXNUMBER || '',
          openingBalance: this.connection.parseAmount(ledger.OPENINGBALANCE),
          closingBalance: this.connection.parseAmount(ledger.CLOSINGBALANCE),
          group: ledger.PARENT || '',
        });
      }

      return {
        success: true,
        data: {
          clause: '32',
          description: 'Loans and Deposits accepted/given',
          data: loans,
          remarks: `Total ${loans.length} loan/deposit accounts found`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to process loans and deposits: ${error.message}` };
    }
  }

  // Clause 34(a) - Fixed Assets
  async getFixedAssetsSchedule(fromDate: string, toDate: string): Promise<TallyResponse<TaxAuditData>> {
    const xml = TallyRequests.getCapitalGoodsRegister(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const assets: any[] = [];
      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        assets.push({
          assetName: ledger.NAME || '',
          category: ledger.PARENT || '',
          openingBalance: this.connection.parseAmount(ledger.OPENINGBALANCE),
          additions: 0, // Would need voucher analysis
          deductions: 0, // Would need voucher analysis
          closingBalance: this.connection.parseAmount(ledger.CLOSINGBALANCE),
        });
      }

      return {
        success: true,
        data: {
          clause: '34(a)',
          description: 'Schedule of Fixed Assets',
          data: assets,
          remarks: `Total ${assets.length} fixed asset categories found`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to process fixed assets: ${error.message}` };
    }
  }

  // Complete Form 3CD data extraction
  async getForm3CDData(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const form3CD: any = {
      partA: {},
      partB: {},
    };

    // Part A - Basic Information (from company data)
    // Part B - Various clauses

    try {
      // Clause 17(a) - Cash transactions
      const cashResult = await this.getCashTransactionsAboveLimit(fromDate, toDate);
      if (cashResult.success) form3CD.partB.clause17a = cashResult.data;

      // Clause 20(b) - Section 40A(3)
      const sec40A3Result = await this.getSection40A3Violations(fromDate, toDate);
      if (sec40A3Result.success) form3CD.partB.clause20b = sec40A3Result.data;

      // Clause 21(b) - TDS
      const tdsResult = await this.getTDSComplianceReport(fromDate, toDate);
      if (tdsResult.success) form3CD.partB.clause21b = tdsResult.data;

      // Clause 26 - Quantitative details
      const quantResult = await this.getQuantitativeDetails(fromDate, toDate);
      if (quantResult.success) form3CD.partB.clause26 = quantResult.data;

      // Clause 31 - GST
      const gstResult = await this.getGSTComplianceSummary(fromDate, toDate);
      if (gstResult.success) form3CD.partB.clause31 = gstResult.data;

      // Clause 32 - Loans
      const loansResult = await this.getLoansAndDeposits(fromDate, toDate);
      if (loansResult.success) form3CD.partB.clause32 = loansResult.data;

      // Clause 34(a) - Fixed Assets
      const assetsResult = await this.getFixedAssetsSchedule(fromDate, toDate);
      if (assetsResult.success) form3CD.partB.clause34a = assetsResult.data;

      return {
        success: true,
        data: form3CD,
      };
    } catch (error: any) {
      return { success: false, error: `Failed to generate Form 3CD data: ${error.message}` };
    }
  }

  // Helper methods
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

  private extractStockItems(data: any): any[] {
    const envelope = data?.ENVELOPE;
    const stockData = envelope?.BODY?.DATA?.COLLECTION?.STOCKITEM;

    if (!stockData) return [];
    return Array.isArray(stockData) ? stockData : [stockData];
  }
}
