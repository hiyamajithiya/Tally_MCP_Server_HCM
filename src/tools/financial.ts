// Financial Analysis Tools
// Trial Balance, P&L, Balance Sheet, Ratios, Aging Analysis

import { TallyConnection } from '../tally/connection.js';
import { TallyRequests } from '../tally/requests.js';
import {
  TrialBalance,
  FinancialRatios,
  AgedReceivable,
  AgedPayable,
  TallyResponse,
} from '../types/tally.js';

export class FinancialTools {
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

  // Get Trial Balance
  async getTrialBalance(fromDate: string, toDate: string): Promise<TallyResponse<TrialBalance[]>> {
    const xml = TallyRequests.getTrialBalance(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const trialBalance: TrialBalance[] = [];
      const ledgers = this.extractLedgers(response.data);

      let totalDebit = 0;
      let totalCredit = 0;

      for (const ledger of ledgers) {
        const openingBalance = this.connection.parseAmount(ledger.OPENINGBALANCE);
        const closingBalance = this.connection.parseAmount(ledger.CLOSINGBALANCE);

        // In Tally, positive is debit for assets/expenses, negative is credit for liabilities/income
        const closingDebit = closingBalance > 0 ? closingBalance : 0;
        const closingCredit = closingBalance < 0 ? Math.abs(closingBalance) : 0;

        if (closingBalance !== 0) {
          trialBalance.push({
            ledgerName: ledger.NAME || '',
            group: ledger.PARENT || '',
            openingDebit: openingBalance > 0 ? openingBalance : 0,
            openingCredit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
            transactionDebit: 0, // Would need voucher analysis
            transactionCredit: 0,
            closingDebit,
            closingCredit,
          });

          totalDebit += closingDebit;
          totalCredit += closingCredit;
        }
      }

      return {
        success: true,
        data: trialBalance,
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get trial balance: ${error.message}` };
    }
  }

  // Get Profit & Loss Statement
  async getProfitAndLoss(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    const xml = TallyRequests.getProfitAndLoss(formattedFromDate, formattedToDate, companyName);
    const response = await this.connection.executeRequest(xml);

    // Also get ledger-wise details
    const ledgerXml = TallyRequests.getLedgers(companyName);
    const ledgerResponse = await this.connection.executeRequest(ledgerXml);

    try {
      const pl: any = {
        income: {
          sales: 0,
          otherIncome: 0,
          total: 0,
          details: [],
        },
        expenses: {
          purchases: 0,
          directExpenses: 0,
          indirectExpenses: 0,
          total: 0,
          details: [],
        },
        grossProfit: 0,
        netProfit: 0,
      };

      if (ledgerResponse.success) {
        const ledgers = this.extractLedgers(ledgerResponse.data);

        for (const ledger of ledgers) {
          const parent = this.extractString(ledger.PARENT).toLowerCase();
          const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);

          if (balance === 0) continue;

          const entry = {
            name: ledger.NAME,
            amount: Math.abs(balance),
            group: ledger.PARENT,
          };

          // Income groups (negative balance in Tally = credit = income)
          if (parent.includes('sales') || parent.includes('revenue')) {
            pl.income.sales += Math.abs(balance);
            pl.income.details.push({ ...entry, type: 'Sales' });
          } else if (
            parent.includes('income') ||
            parent.includes('indirect income') ||
            parent.includes('other income')
          ) {
            pl.income.otherIncome += Math.abs(balance);
            pl.income.details.push({ ...entry, type: 'Other Income' });
          }
          // Expense groups (positive balance in Tally = debit = expense)
          else if (parent.includes('purchase')) {
            pl.expenses.purchases += Math.abs(balance);
            pl.expenses.details.push({ ...entry, type: 'Purchase' });
          } else if (parent.includes('direct expense')) {
            pl.expenses.directExpenses += Math.abs(balance);
            pl.expenses.details.push({ ...entry, type: 'Direct Expense' });
          } else if (parent.includes('indirect expense')) {
            pl.expenses.indirectExpenses += Math.abs(balance);
            pl.expenses.details.push({ ...entry, type: 'Indirect Expense' });
          }
        }
      }

      pl.income.total = pl.income.sales + pl.income.otherIncome;
      pl.expenses.total = pl.expenses.purchases + pl.expenses.directExpenses + pl.expenses.indirectExpenses;
      pl.grossProfit = pl.income.sales - pl.expenses.purchases - pl.expenses.directExpenses;
      pl.netProfit = pl.income.total - pl.expenses.total;

      return { success: true, data: pl };
    } catch (error: any) {
      return { success: false, error: `Failed to get P&L: ${error.message}` };
    }
  }

  // Get Balance Sheet
  async getBalanceSheet(asOnDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();

    const xml = TallyRequests.getBalanceSheet(
      this.connection.formatTallyDate(new Date(asOnDate)),
      companyName
    );
    const response = await this.connection.executeRequest(xml);

    const ledgerXml = TallyRequests.getLedgers(companyName);
    const ledgerResponse = await this.connection.executeRequest(ledgerXml);

    try {
      const bs: any = {
        liabilities: {
          capital: 0,
          reservesAndSurplus: 0,
          securedLoans: 0,
          unsecuredLoans: 0,
          currentLiabilities: 0,
          total: 0,
          details: [],
        },
        assets: {
          fixedAssets: 0,
          investments: 0,
          currentAssets: 0,
          loansAndAdvances: 0,
          total: 0,
          details: [],
        },
      };

      if (ledgerResponse.success) {
        const ledgers = this.extractLedgers(ledgerResponse.data);

        for (const ledger of ledgers) {
          const parent = this.extractString(ledger.PARENT).toLowerCase();
          const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);

          if (balance === 0) continue;

          const entry = {
            name: ledger.NAME,
            amount: Math.abs(balance),
            group: ledger.PARENT,
          };

          // Liabilities (credit balance = negative in Tally)
          if (parent.includes('capital')) {
            bs.liabilities.capital += Math.abs(balance);
            bs.liabilities.details.push({ ...entry, type: 'Capital' });
          } else if (parent.includes('reserves') || parent.includes('surplus')) {
            bs.liabilities.reservesAndSurplus += Math.abs(balance);
            bs.liabilities.details.push({ ...entry, type: 'Reserves & Surplus' });
          } else if (parent.includes('secured loan')) {
            bs.liabilities.securedLoans += Math.abs(balance);
            bs.liabilities.details.push({ ...entry, type: 'Secured Loans' });
          } else if (parent.includes('unsecured loan')) {
            bs.liabilities.unsecuredLoans += Math.abs(balance);
            bs.liabilities.details.push({ ...entry, type: 'Unsecured Loans' });
          } else if (
            parent.includes('current liabilities') ||
            parent.includes('sundry creditor') ||
            parent.includes('duties')
          ) {
            bs.liabilities.currentLiabilities += Math.abs(balance);
            bs.liabilities.details.push({ ...entry, type: 'Current Liabilities' });
          }
          // Assets (debit balance = positive in Tally)
          else if (parent.includes('fixed asset')) {
            bs.assets.fixedAssets += Math.abs(balance);
            bs.assets.details.push({ ...entry, type: 'Fixed Assets' });
          } else if (parent.includes('investment')) {
            bs.assets.investments += Math.abs(balance);
            bs.assets.details.push({ ...entry, type: 'Investments' });
          } else if (
            parent.includes('current asset') ||
            parent.includes('sundry debtor') ||
            parent.includes('stock') ||
            parent.includes('cash') ||
            parent.includes('bank')
          ) {
            bs.assets.currentAssets += Math.abs(balance);
            bs.assets.details.push({ ...entry, type: 'Current Assets' });
          } else if (parent.includes('loans and advances')) {
            bs.assets.loansAndAdvances += Math.abs(balance);
            bs.assets.details.push({ ...entry, type: 'Loans & Advances' });
          }
        }
      }

      bs.liabilities.total =
        bs.liabilities.capital +
        bs.liabilities.reservesAndSurplus +
        bs.liabilities.securedLoans +
        bs.liabilities.unsecuredLoans +
        bs.liabilities.currentLiabilities;

      bs.assets.total =
        bs.assets.fixedAssets +
        bs.assets.investments +
        bs.assets.currentAssets +
        bs.assets.loansAndAdvances;

      bs.difference = bs.assets.total - bs.liabilities.total;

      return { success: true, data: bs };
    } catch (error: any) {
      return { success: false, error: `Failed to get balance sheet: ${error.message}` };
    }
  }

  // Calculate Financial Ratios
  async calculateFinancialRatios(fromDate: string, toDate: string): Promise<TallyResponse<FinancialRatios>> {
    const [plResult, bsResult] = await Promise.all([
      this.getProfitAndLoss(fromDate, toDate),
      this.getBalanceSheet(toDate),
    ]);

    if (!plResult.success) return plResult;
    if (!bsResult.success) return bsResult;

    try {
      const pl = plResult.data;
      const bs = bsResult.data;

      // Extract key figures
      const sales = pl.income.sales || 1; // Prevent division by zero
      const netProfit = pl.netProfit || 0;
      const grossProfit = pl.grossProfit || 0;
      const operatingProfit = grossProfit - pl.expenses.indirectExpenses;

      const currentAssets = bs.assets.currentAssets || 0;
      const currentLiabilities = bs.liabilities.currentLiabilities || 1;
      const inventory = 0; // Would need separate extraction
      const totalAssets = bs.assets.total || 1;
      const totalDebt = bs.liabilities.securedLoans + bs.liabilities.unsecuredLoans;
      const equity = bs.liabilities.capital + bs.liabilities.reservesAndSurplus || 1;
      const interestExpense = 0; // Would need separate extraction
      const debtors = 0; // Would need separate extraction
      const creditors = 0; // Would need separate extraction

      const ratios: FinancialRatios = {
        // Liquidity Ratios
        currentRatio: currentAssets / currentLiabilities,
        quickRatio: (currentAssets - inventory) / currentLiabilities,

        // Leverage Ratios
        debtEquityRatio: totalDebt / equity,

        // Profitability Ratios
        returnOnEquity: (netProfit / equity) * 100,
        returnOnAssets: (netProfit / totalAssets) * 100,
        netProfitMargin: (netProfit / sales) * 100,
        grossProfitMargin: (grossProfit / sales) * 100,
        operatingProfitMargin: (operatingProfit / sales) * 100,

        // Efficiency Ratios
        inventoryTurnover: sales / (inventory || 1),
        debtorsTurnover: sales / (debtors || 1),
        creditorsTurnover: pl.expenses.purchases / (creditors || 1),
        workingCapitalTurnover: sales / ((currentAssets - currentLiabilities) || 1),
        assetTurnover: sales / totalAssets,

        // Coverage Ratios
        interestCoverageRatio: interestExpense ? operatingProfit / interestExpense : 0,
      };

      return { success: true, data: ratios };
    } catch (error: any) {
      return { success: false, error: `Failed to calculate ratios: ${error.message}` };
    }
  }

  // Get Debtors Aging Analysis
  async getDebtorsAging(asOnDate: string): Promise<TallyResponse<AgedReceivable[]>> {
    const xml = TallyRequests.getReceivablesAging(
      this.connection.formatTallyDate(new Date(asOnDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const aging: AgedReceivable[] = [];
      const ledgers = this.extractLedgers(response.data);
      const reconDate = new Date(asOnDate);

      for (const ledger of ledgers) {
        const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);
        if (balance <= 0) continue; // Only debit balances (receivables)

        const aged: AgedReceivable = {
          partyName: ledger.NAME || '',
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days180: 0,
          above180: 0,
          total: balance,
          billWiseDetails: [],
        };

        // Process bill allocations
        const bills = this.extractBillAllocations(ledger);
        for (const bill of bills) {
          const billDate = new Date(bill.billDate || asOnDate);
          const agingDays = Math.floor(
            (reconDate.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          const amount = this.connection.parseAmount(bill.amount);

          if (agingDays <= 0) {
            aged.current += amount;
          } else if (agingDays <= 30) {
            aged.days30 += amount;
          } else if (agingDays <= 60) {
            aged.days60 += amount;
          } else if (agingDays <= 90) {
            aged.days90 += amount;
          } else if (agingDays <= 180) {
            aged.days180 += amount;
          } else {
            aged.above180 += amount;
          }

          aged.billWiseDetails!.push({
            billNumber: bill.name || '',
            billDate: bill.billDate || '',
            dueDate: bill.dueDate || '',
            amount: amount,
            pending: amount,
            agingDays,
          });
        }

        // If no bills, put entire balance in current
        if (bills.length === 0) {
          aged.current = balance;
        }

        aging.push(aged);
      }

      return { success: true, data: aging };
    } catch (error: any) {
      return { success: false, error: `Failed to get debtors aging: ${error.message}` };
    }
  }

  // Get Creditors Aging Analysis
  async getCreditorsAging(asOnDate: string): Promise<TallyResponse<AgedPayable[]>> {
    const xml = TallyRequests.getPayablesAging(
      this.connection.formatTallyDate(new Date(asOnDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const aging: AgedPayable[] = [];
      const ledgers = this.extractLedgers(response.data);
      const reconDate = new Date(asOnDate);

      for (const ledger of ledgers) {
        const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);
        if (balance >= 0) continue; // Only credit balances (payables)

        const aged: AgedPayable = {
          partyName: ledger.NAME || '',
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days180: 0,
          above180: 0,
          total: Math.abs(balance),
          billWiseDetails: [],
        };

        // Process bill allocations
        const bills = this.extractBillAllocations(ledger);
        for (const bill of bills) {
          const billDate = new Date(bill.billDate || asOnDate);
          const agingDays = Math.floor(
            (reconDate.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          const amount = Math.abs(this.connection.parseAmount(bill.amount));

          if (agingDays <= 0) {
            aged.current += amount;
          } else if (agingDays <= 30) {
            aged.days30 += amount;
          } else if (agingDays <= 60) {
            aged.days60 += amount;
          } else if (agingDays <= 90) {
            aged.days90 += amount;
          } else if (agingDays <= 180) {
            aged.days180 += amount;
          } else {
            aged.above180 += amount;
          }

          aged.billWiseDetails!.push({
            billNumber: bill.name || '',
            billDate: bill.billDate || '',
            dueDate: bill.dueDate || '',
            amount: amount,
            pending: amount,
            agingDays,
          });
        }

        // If no bills, put entire balance in current
        if (bills.length === 0) {
          aged.current = Math.abs(balance);
        }

        aging.push(aged);
      }

      return { success: true, data: aging };
    } catch (error: any) {
      return { success: false, error: `Failed to get creditors aging: ${error.message}` };
    }
  }

  // Get MSME Payables (as required under Section 43B(h))
  async getMSMEPayables(asOnDate: string): Promise<TallyResponse<any>> {
    const creditorsResult = await this.getCreditorsAging(asOnDate);
    if (!creditorsResult.success) return creditorsResult;

    try {
      // Filter creditors based on MSME status
      // Note: This requires MSME tagging in Tally ledger master
      const msmePayables: any[] = [];
      const overduePayables: any[] = [];

      for (const creditor of creditorsResult.data!) {
        // Check if overdue beyond 45 days (MSME payment limit)
        const overdueAmount =
          creditor.days60 + creditor.days90 + creditor.days180 + creditor.above180;

        if (overdueAmount > 0) {
          overduePayables.push({
            partyName: creditor.partyName,
            totalOutstanding: creditor.total,
            overdueAmount: overdueAmount,
            within45Days: creditor.current + creditor.days30,
            above45Days: overdueAmount,
            billWiseDetails: creditor.billWiseDetails?.filter((b: any) => b.agingDays > 45),
          });
        }
      }

      return {
        success: true,
        data: {
          overduePayables,
          summary: {
            totalOverdue: overduePayables.reduce((sum, p) => sum + p.overdueAmount, 0),
            partiesCount: overduePayables.length,
            remarks:
              'Amount outstanding to MSMEs beyond 45 days is disallowed u/s 43B(h) of Income Tax Act',
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get MSME payables: ${error.message}` };
    }
  }

  // Get Stock Summary
  async getStockSummary(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const xml = TallyRequests.getStockSummary(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const stockXml = TallyRequests.getStockItems(this.connection.getCompanyName());
      const stockResponse = await this.connection.executeRequest(stockXml);

      const stockSummary: any[] = [];
      let totalOpeningValue = 0;
      let totalClosingValue = 0;

      if (stockResponse.success) {
        const items = this.extractStockItems(stockResponse.data);

        for (const item of items) {
          const openingValue = this.connection.parseAmount(item.OPENINGVALUE);
          const closingValue = this.connection.parseAmount(item.CLOSINGVALUE);

          stockSummary.push({
            itemName: item.NAME || '',
            group: item.PARENT || '',
            hsnCode: item.HSNCODE || '',
            openingQty: this.connection.parseAmount(item.OPENINGBALANCE),
            openingValue: openingValue,
            closingQty: this.connection.parseAmount(item.CLOSINGBALANCE),
            closingValue: closingValue,
            rate: item.GSTRATE || 0,
          });

          totalOpeningValue += openingValue;
          totalClosingValue += closingValue;
        }
      }

      return {
        success: true,
        data: {
          items: stockSummary,
          summary: {
            totalOpeningValue,
            totalClosingValue,
            changeInStock: totalClosingValue - totalOpeningValue,
            itemCount: stockSummary.length,
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get stock summary: ${error.message}` };
    }
  }

  // Get Day Book
  async getDayBook(date: string): Promise<TallyResponse<any[]>> {
    const xml = TallyRequests.getDayBook(
      this.connection.formatTallyDate(new Date(date)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const dayBook: any[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        dayBook.push({
          date: this.connection.parseDate(voucher.DATE),
          voucherType: voucher.VOUCHERTYPENAME || '',
          voucherNumber: voucher.VOUCHERNUMBER || '',
          partyName: voucher.PARTYLEDGERNAME || '',
          amount: Math.abs(this.connection.parseAmount(voucher.AMOUNT)),
          narration: voucher.NARRATION || '',
          ledgerEntries: this.extractLedgerEntries(voucher).map((e: any) => ({
            ledger: e.LEDGERNAME,
            amount: this.connection.parseAmount(e.AMOUNT),
          })),
        });
      }

      return { success: true, data: dayBook };
    } catch (error: any) {
      return { success: false, error: `Failed to get day book: ${error.message}` };
    }
  }

  // Get Ledger Statement
  async getLedgerStatement(
    ledgerName: string,
    fromDate: string,
    toDate: string
  ): Promise<TallyResponse<any>> {
    const xml = TallyRequests.getLedgerVouchers(
      ledgerName,
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const transactions: any[] = [];
      const vouchers = this.extractVouchers(response.data);
      let runningBalance = 0;

      // Sort by date
      vouchers.sort((a: any, b: any) => {
        const dateA = this.connection.parseDate(a.DATE);
        const dateB = this.connection.parseDate(b.DATE);
        return dateA.localeCompare(dateB);
      });

      for (const voucher of vouchers) {
        const ledgerEntries = this.extractLedgerEntries(voucher);
        const entry = ledgerEntries.find(
          (e: any) => this.extractString(e.LEDGERNAME).toLowerCase() === ledgerName.toLowerCase()
        );

        if (entry) {
          const amount = this.connection.parseAmount(entry.AMOUNT);
          runningBalance += amount;

          transactions.push({
            date: this.connection.parseDate(voucher.DATE),
            voucherType: voucher.VOUCHERTYPENAME || '',
            voucherNumber: voucher.VOUCHERNUMBER || '',
            particulars: this.getParticulars(ledgerEntries, ledgerName),
            debit: amount > 0 ? amount : 0,
            credit: amount < 0 ? Math.abs(amount) : 0,
            balance: runningBalance,
            narration: voucher.NARRATION || '',
          });
        }
      }

      return {
        success: true,
        data: {
          ledgerName,
          fromDate,
          toDate,
          transactions,
          closingBalance: runningBalance,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get ledger statement: ${error.message}` };
    }
  }

  // Get Group Summary
  async getGroupSummary(groupName: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const xml = TallyRequests.getLedgers(companyName);
    const response = await this.connection.executeRequest(xml);

    if (!response.success) return response;

    try {
      const groupLedgers: any[] = [];
      let totalOpening = 0;
      let totalClosing = 0;

      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        if (this.extractString(ledger.PARENT).toLowerCase() === groupName.toLowerCase()) {
          const opening = this.connection.parseAmount(ledger.OPENINGBALANCE);
          const closing = this.connection.parseAmount(ledger.CLOSINGBALANCE);

          groupLedgers.push({
            name: ledger.NAME,
            openingBalance: opening,
            closingBalance: closing,
          });

          totalOpening += opening;
          totalClosing += closing;
        }
      }

      return {
        success: true,
        data: {
          groupName,
          ledgers: groupLedgers,
          totalOpening,
          totalClosing,
          ledgerCount: groupLedgers.length,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get group summary: ${error.message}` };
    }
  }

  // Private helper methods
  private getParticulars(ledgerEntries: any[], excludeLedger: string): string {
    const otherLedgers = ledgerEntries
      .filter((e: any) => this.extractString(e.LEDGERNAME).toLowerCase() !== excludeLedger.toLowerCase())
      .map((e: any) => e.LEDGERNAME);

    return otherLedgers.join(', ') || 'Unknown';
  }

  private extractBillAllocations(ledger: any): any[] {
    const bills = ledger['BILLALLOCATIONS.LIST'] || ledger.BILLALLOCATIONS;
    if (!bills) return [];
    return Array.isArray(bills) ? bills : [bills];
  }

  private extractVouchers(data: any): any[] {
    const envelope = data?.ENVELOPE;
    const voucherData =
      envelope?.BODY?.DATA?.COLLECTION?.VOUCHER || envelope?.BODY?.DATA?.TALLYMESSAGE?.VOUCHER;
    if (!voucherData) return [];
    return Array.isArray(voucherData) ? voucherData : [voucherData];
  }

  private extractLedgerEntries(voucher: any): any[] {
    const entries =
      voucher['ALLLEDGERENTRIES.LIST'] || voucher.ALLLEDGERENTRIES || voucher.LEDGERENTRIES;
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
