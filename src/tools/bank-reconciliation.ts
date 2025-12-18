// Bank Reconciliation Tools
// BRS preparation and statement matching

import { TallyConnection } from '../tally/connection.js';
import { TallyRequests } from '../tally/requests.js';
import { BankTransaction, BankReconciliationStatement, TallyResponse } from '../types/tally.js';

export interface BankStatementEntry {
  date: string;
  description: string;
  chequeNumber?: string;
  debit: number;
  credit: number;
  balance: number;
  reference?: string;
}

export class BankReconciliationTools {
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

  // Get list of all bank ledgers
  async getBankLedgers(): Promise<TallyResponse<any[]>> {
    const xml = TallyRequests.getBankLedgers(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(xml);

    if (!response.success) return response;

    try {
      const banks: any[] = [];
      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        banks.push({
          name: ledger.NAME || '',
          accountNumber: ledger.BANKACCOUNTNUMBER || '',
          accountHolder: ledger.BANKACCHOLDERNAME || '',
          ifscCode: ledger.IFSCODE || '',
          openingBalance: this.connection.parseAmount(ledger.OPENINGBALANCE),
          closingBalance: this.connection.parseAmount(ledger.CLOSINGBALANCE),
        });
      }

      return { success: true, data: banks };
    } catch (error: any) {
      return { success: false, error: `Failed to get bank ledgers: ${error.message}` };
    }
  }

  // Get bank book (transactions from Tally)
  async getBankBook(
    bankLedgerName: string,
    fromDate: string,
    toDate: string
  ): Promise<TallyResponse<BankTransaction[]>> {
    const xml = TallyRequests.getBankTransactions(
      bankLedgerName,
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const transactions: BankTransaction[] = [];
      const vouchers = this.extractVouchers(response.data);
      let runningBalance = 0;

      // Sort by date
      vouchers.sort((a: any, b: any) => {
        const dateA = this.connection.parseDate(a.DATE);
        const dateB = this.connection.parseDate(b.DATE);
        return dateA.localeCompare(dateB);
      });

      for (const voucher of vouchers) {
        const bankAllocation = this.extractBankAllocation(voucher, bankLedgerName);
        if (!bankAllocation) continue;

        const amount = this.connection.parseAmount(bankAllocation.amount);
        const isDebit = amount > 0;

        runningBalance += amount;

        transactions.push({
          date: this.connection.parseDate(voucher.DATE),
          voucherNumber: voucher.VOUCHERNUMBER || '',
          chequeNumber: bankAllocation.chequeNumber || '',
          instrumentDate: bankAllocation.instrumentDate || '',
          narration: voucher.NARRATION || '',
          debit: isDebit ? amount : 0,
          credit: isDebit ? 0 : Math.abs(amount),
          balance: runningBalance,
          isReconciled: !!bankAllocation.bankDate,
          bankDate: bankAllocation.bankDate || '',
          status: bankAllocation.bankDate ? 'Reconciled' : 'Uncleared',
        });
      }

      return { success: true, data: transactions };
    } catch (error: any) {
      return { success: false, error: `Failed to get bank book: ${error.message}` };
    }
  }

  // Generate Bank Reconciliation Statement
  async generateBRS(
    bankLedgerName: string,
    asOnDate: string
  ): Promise<TallyResponse<BankReconciliationStatement>> {
    const fromDate = '2000-04-01'; // From beginning
    const bankBookResult = await this.getBankBook(bankLedgerName, fromDate, asOnDate);

    if (!bankBookResult.success) {
      return { success: false, error: bankBookResult.error };
    }

    try {
      const transactions = bankBookResult.data!;
      const reconDate = new Date(asOnDate);

      // Separate uncleared items
      const unClearedCheques: BankTransaction[] = [];
      const unClearedDeposits: BankTransaction[] = [];
      let balanceAsPerBooks = 0;

      for (const txn of transactions) {
        // Calculate book balance
        balanceAsPerBooks += txn.debit - txn.credit;

        // Check if uncleared as on the reconciliation date
        if (!txn.isReconciled || (txn.bankDate && new Date(txn.bankDate) > reconDate)) {
          if (txn.credit > 0) {
            // Cheques issued but not presented
            unClearedCheques.push(txn);
          } else if (txn.debit > 0) {
            // Deposits not credited
            unClearedDeposits.push(txn);
          }
        }
      }

      // Calculate BRS
      const totalUnClearedCheques = unClearedCheques.reduce((sum, t) => sum + t.credit, 0);
      const totalUnClearedDeposits = unClearedDeposits.reduce((sum, t) => sum + t.debit, 0);

      // Balance as per bank = Balance as per books + Cheques issued not presented - Deposits not credited
      const balanceAsPerBank = balanceAsPerBooks + totalUnClearedCheques - totalUnClearedDeposits;

      const brs: BankReconciliationStatement = {
        bankName: bankLedgerName,
        asOnDate: asOnDate,
        balanceAsPerBooks: balanceAsPerBooks,
        balanceAsPerBank: balanceAsPerBank,
        unClearedCheques: unClearedCheques,
        unClearedDeposits: unClearedDeposits,
        reconciliationDifference: 0, // Will be non-zero only if there are errors
      };

      return { success: true, data: brs };
    } catch (error: any) {
      return { success: false, error: `Failed to generate BRS: ${error.message}` };
    }
  }

  // Auto-reconcile with bank statement
  async autoReconcile(
    bankLedgerName: string,
    fromDate: string,
    toDate: string,
    bankStatement: BankStatementEntry[]
  ): Promise<TallyResponse<any>> {
    const bankBookResult = await this.getBankBook(bankLedgerName, fromDate, toDate);
    if (!bankBookResult.success) return bankBookResult;

    try {
      const reconciliation = {
        matched: [] as any[],
        unmatchedInBooks: [] as BankTransaction[],
        unmatchedInStatement: [] as BankStatementEntry[],
        amountMismatch: [] as any[],
        dateMismatch: [] as any[],
        summary: {
          totalMatched: 0,
          totalUnmatchedBooks: 0,
          totalUnmatchedStatement: 0,
          matchPercentage: 0,
        },
      };

      const bookTransactions = [...bankBookResult.data!];
      const statementEntries = [...bankStatement];

      // Create maps for matching
      const bookMap = new Map<string, BankTransaction[]>();
      for (const txn of bookTransactions) {
        const key = this.createMatchKey(txn);
        if (!bookMap.has(key)) bookMap.set(key, []);
        bookMap.get(key)!.push(txn);
      }

      // Match statement entries with book transactions
      for (const entry of statementEntries) {
        const amount = entry.debit || entry.credit;
        const isDebit = entry.debit > 0;

        let matched = false;

        // Try exact match by cheque number and amount
        if (entry.chequeNumber) {
          const key = `${entry.chequeNumber}_${amount.toFixed(2)}`;
          const candidates = bookMap.get(key);
          if (candidates && candidates.length > 0) {
            const bookTxn = candidates.shift()!;
            reconciliation.matched.push({
              bookTransaction: bookTxn,
              statementEntry: entry,
              matchType: 'Exact',
            });
            matched = true;
            reconciliation.summary.totalMatched++;

            // Remove from book map
            const idx = bookTransactions.indexOf(bookTxn);
            if (idx > -1) bookTransactions.splice(idx, 1);
          }
        }

        // Try match by amount and approximate date
        if (!matched) {
          const dateTolerance = 7; // 7 days tolerance
          const entryDate = new Date(entry.date);

          for (let i = 0; i < bookTransactions.length; i++) {
            const bookTxn = bookTransactions[i];
            const bookAmount = bookTxn.debit || bookTxn.credit;
            const bookDate = new Date(bookTxn.date);

            // Check amount match
            if (Math.abs(amount - bookAmount) < 1) {
              // Check date tolerance
              const daysDiff = Math.abs(
                (entryDate.getTime() - bookDate.getTime()) / (1000 * 60 * 60 * 24)
              );

              if (daysDiff <= dateTolerance) {
                reconciliation.matched.push({
                  bookTransaction: bookTxn,
                  statementEntry: entry,
                  matchType: daysDiff === 0 ? 'Amount+Date' : 'Amount (Date Mismatch)',
                  daysDifference: daysDiff,
                });
                matched = true;
                reconciliation.summary.totalMatched++;
                bookTransactions.splice(i, 1);
                break;
              }
            }
          }
        }

        if (!matched) {
          reconciliation.unmatchedInStatement.push(entry);
          reconciliation.summary.totalUnmatchedStatement++;
        }
      }

      // Remaining book transactions are unmatched
      reconciliation.unmatchedInBooks = bookTransactions;
      reconciliation.summary.totalUnmatchedBooks = bookTransactions.length;

      // Calculate match percentage
      const totalEntries =
        reconciliation.summary.totalMatched +
        reconciliation.summary.totalUnmatchedBooks +
        reconciliation.summary.totalUnmatchedStatement;

      reconciliation.summary.matchPercentage =
        totalEntries > 0 ? (reconciliation.summary.totalMatched / totalEntries) * 100 : 0;

      return { success: true, data: reconciliation };
    } catch (error: any) {
      return { success: false, error: `Failed to auto-reconcile: ${error.message}` };
    }
  }

  // Get aging of uncleared cheques/deposits
  async getUnclearedAging(
    bankLedgerName: string,
    asOnDate: string
  ): Promise<TallyResponse<any>> {
    const brsResult = await this.generateBRS(bankLedgerName, asOnDate);
    if (!brsResult.success) return brsResult;

    try {
      const brs = brsResult.data!;
      const reconDate = new Date(asOnDate);

      const aging = {
        cheques: {
          within7Days: [] as BankTransaction[],
          within30Days: [] as BankTransaction[],
          within90Days: [] as BankTransaction[],
          above90Days: [] as BankTransaction[],
          totals: { within7: 0, within30: 0, within90: 0, above90: 0 },
        },
        deposits: {
          within7Days: [] as BankTransaction[],
          within30Days: [] as BankTransaction[],
          within90Days: [] as BankTransaction[],
          above90Days: [] as BankTransaction[],
          totals: { within7: 0, within30: 0, within90: 0, above90: 0 },
        },
      };

      // Age cheques
      for (const cheque of brs.unClearedCheques) {
        const txnDate = new Date(cheque.date);
        const agingDays = Math.floor(
          (reconDate.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (agingDays <= 7) {
          aging.cheques.within7Days.push(cheque);
          aging.cheques.totals.within7 += cheque.credit;
        } else if (agingDays <= 30) {
          aging.cheques.within30Days.push(cheque);
          aging.cheques.totals.within30 += cheque.credit;
        } else if (agingDays <= 90) {
          aging.cheques.within90Days.push(cheque);
          aging.cheques.totals.within90 += cheque.credit;
        } else {
          aging.cheques.above90Days.push(cheque);
          aging.cheques.totals.above90 += cheque.credit;
        }
      }

      // Age deposits
      for (const deposit of brs.unClearedDeposits) {
        const txnDate = new Date(deposit.date);
        const agingDays = Math.floor(
          (reconDate.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (agingDays <= 7) {
          aging.deposits.within7Days.push(deposit);
          aging.deposits.totals.within7 += deposit.debit;
        } else if (agingDays <= 30) {
          aging.deposits.within30Days.push(deposit);
          aging.deposits.totals.within30 += deposit.debit;
        } else if (agingDays <= 90) {
          aging.deposits.within90Days.push(deposit);
          aging.deposits.totals.within90 += deposit.debit;
        } else {
          aging.deposits.above90Days.push(deposit);
          aging.deposits.totals.above90 += deposit.debit;
        }
      }

      // Flag stale cheques (above 90 days - typically 3 months for cheque validity)
      const staleCheques = aging.cheques.above90Days.filter((c) => {
        const txnDate = new Date(c.date);
        const agingDays = Math.floor(
          (reconDate.getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        return agingDays > 90; // Stale after 90 days (was 180 for pre-2021)
      });

      return {
        success: true,
        data: {
          aging,
          staleCheques,
          staleChequesTotal: staleCheques.reduce((sum, c) => sum + c.credit, 0),
          remarks:
            staleCheques.length > 0
              ? `${staleCheques.length} stale cheques found. Consider writing back to income.`
              : 'No stale cheques found.',
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get uncleared aging: ${error.message}` };
    }
  }

  // Get bank summary for all banks
  async getAllBanksSummary(asOnDate: string): Promise<TallyResponse<any>> {
    const banksResult = await this.getBankLedgers();
    if (!banksResult.success) return banksResult;

    try {
      const summaries: any[] = [];

      for (const bank of banksResult.data!) {
        const brsResult = await this.generateBRS(bank.name, asOnDate);
        if (brsResult.success) {
          const brs = brsResult.data!;
          summaries.push({
            bankName: bank.name,
            accountNumber: bank.accountNumber,
            balanceAsPerBooks: brs.balanceAsPerBooks,
            balanceAsPerBank: brs.balanceAsPerBank,
            unclearedCheques: brs.unClearedCheques.length,
            unclearedChequesAmount: brs.unClearedCheques.reduce((sum, c) => sum + c.credit, 0),
            unclearedDeposits: brs.unClearedDeposits.length,
            unclearedDepositsAmount: brs.unClearedDeposits.reduce((sum, d) => sum + d.debit, 0),
          });
        }
      }

      const totals = {
        totalBalanceBooks: summaries.reduce((sum, s) => sum + s.balanceAsPerBooks, 0),
        totalBalanceBank: summaries.reduce((sum, s) => sum + s.balanceAsPerBank, 0),
        totalUnclearedCheques: summaries.reduce((sum, s) => sum + s.unclearedChequesAmount, 0),
        totalUnclearedDeposits: summaries.reduce((sum, s) => sum + s.unclearedDepositsAmount, 0),
      };

      return { success: true, data: { banks: summaries, totals } };
    } catch (error: any) {
      return { success: false, error: `Failed to get banks summary: ${error.message}` };
    }
  }

  // Get cheque register
  async getChequeRegister(
    bankLedgerName: string,
    fromDate: string,
    toDate: string
  ): Promise<TallyResponse<any[]>> {
    const bankBookResult = await this.getBankBook(bankLedgerName, fromDate, toDate);
    if (!bankBookResult.success) return bankBookResult;

    try {
      const chequeRegister = bankBookResult.data!
        .filter((txn) => txn.chequeNumber)
        .map((txn) => ({
          date: txn.date,
          chequeNumber: txn.chequeNumber,
          instrumentDate: txn.instrumentDate,
          partyName: txn.narration.split('/')[0]?.trim() || 'Unknown',
          amount: txn.credit || txn.debit,
          type: txn.credit > 0 ? 'Issued' : 'Received',
          status: txn.status,
          bankDate: txn.bankDate,
          daysOutstanding: txn.isReconciled
            ? 0
            : Math.floor(
                (new Date().getTime() - new Date(txn.date).getTime()) / (1000 * 60 * 60 * 24)
              ),
        }));

      return { success: true, data: chequeRegister };
    } catch (error: any) {
      return { success: false, error: `Failed to get cheque register: ${error.message}` };
    }
  }

  // Get post-dated cheques
  async getPostDatedCheques(
    bankLedgerName: string,
    asOnDate: string
  ): Promise<TallyResponse<any>> {
    const bankBookResult = await this.getBankBook(bankLedgerName, '2000-04-01', asOnDate);
    if (!bankBookResult.success) return bankBookResult;

    try {
      const reconDate = new Date(asOnDate);
      const pdcIssued: any[] = [];
      const pdcReceived: any[] = [];

      for (const txn of bankBookResult.data!) {
        if (txn.instrumentDate) {
          const instrumentDate = new Date(txn.instrumentDate);
          if (instrumentDate > reconDate) {
            const entry = {
              voucherDate: txn.date,
              chequeNumber: txn.chequeNumber,
              chequeDate: txn.instrumentDate,
              amount: txn.credit || txn.debit,
              narration: txn.narration,
              daysToMaturity: Math.floor(
                (instrumentDate.getTime() - reconDate.getTime()) / (1000 * 60 * 60 * 24)
              ),
            };

            if (txn.credit > 0) {
              pdcIssued.push(entry);
            } else {
              pdcReceived.push(entry);
            }
          }
        }
      }

      return {
        success: true,
        data: {
          pdcIssued,
          pdcReceived,
          totals: {
            totalPDCIssued: pdcIssued.reduce((sum, p) => sum + p.amount, 0),
            totalPDCReceived: pdcReceived.reduce((sum, p) => sum + p.amount, 0),
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get post-dated cheques: ${error.message}` };
    }
  }

  // Get bank charges analysis
  async getBankChargesAnalysis(
    bankLedgerName: string,
    fromDate: string,
    toDate: string
  ): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Get vouchers with bank charges
    const voucherXml = TallyRequests.getVouchers(formattedFromDate, formattedToDate, undefined, companyName);
    const response = await this.connection.executeRequest(voucherXml);

    if (!response.success) return response;

    try {
      const bankCharges: any[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        const ledgerEntries = this.extractLedgerEntries(voucher);

        // Check if this voucher involves the bank account
        const hasBankAccount = ledgerEntries.some(
          (e: any) => this.extractString(e.LEDGERNAME).toLowerCase() === bankLedgerName.toLowerCase()
        );

        if (hasBankAccount) {
          // Look for bank charges ledger
          for (const entry of ledgerEntries) {
            const ledgerName = this.extractString(entry.LEDGERNAME).toLowerCase();
            if (
              ledgerName.includes('bank charge') ||
              ledgerName.includes('bank commission') ||
              ledgerName.includes('bank interest') ||
              ledgerName.includes('processing fee') ||
              ledgerName.includes('service charge')
            ) {
              bankCharges.push({
                date: this.connection.parseDate(voucher.DATE),
                voucherNumber: voucher.VOUCHERNUMBER,
                chargeType: entry.LEDGERNAME,
                amount: Math.abs(this.connection.parseAmount(entry.AMOUNT)),
                narration: voucher.NARRATION || '',
              });
            }
          }
        }
      }

      // Group by charge type
      const byChargeType: Record<string, number> = {};
      for (const charge of bankCharges) {
        const type = charge.chargeType;
        byChargeType[type] = (byChargeType[type] || 0) + charge.amount;
      }

      return {
        success: true,
        data: {
          transactions: bankCharges,
          totalCharges: bankCharges.reduce((sum, c) => sum + c.amount, 0),
          byChargeType,
          monthWise: this.groupByMonth(bankCharges),
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to analyze bank charges: ${error.message}` };
    }
  }

  // Private helper methods
  private createMatchKey(txn: BankTransaction): string {
    const amount = txn.debit || txn.credit;
    return `${txn.chequeNumber || ''}_${amount.toFixed(2)}`;
  }

  private extractBankAllocation(voucher: any, bankLedgerName: string): any | null {
    const ledgerEntries = this.extractLedgerEntries(voucher);

    for (const entry of ledgerEntries) {
      if (this.extractString(entry.LEDGERNAME).toLowerCase() === bankLedgerName.toLowerCase()) {
        const bankAllocations = entry['BANKALLOCATIONS.LIST'] || entry.BANKALLOCATIONS;
        const allocation = Array.isArray(bankAllocations) ? bankAllocations[0] : bankAllocations;

        return {
          amount: this.connection.parseAmount(entry.AMOUNT),
          chequeNumber:
            allocation?.INSTRUMENTNUMBER ||
            allocation?.TRANSACTIONNUMBER ||
            entry.CHEQUENUMBER ||
            '',
          instrumentDate: allocation?.INSTRUMENTDATE
            ? this.connection.parseDate(allocation.INSTRUMENTDATE)
            : '',
          bankDate: allocation?.BANKDATE ? this.connection.parseDate(allocation.BANKDATE) : '',
        };
      }
    }

    return null;
  }

  private groupByMonth(charges: any[]): Record<string, number> {
    const monthWise: Record<string, number> = {};

    for (const charge of charges) {
      const date = new Date(charge.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthWise[monthKey] = (monthWise[monthKey] || 0) + charge.amount;
    }

    return monthWise;
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
}
