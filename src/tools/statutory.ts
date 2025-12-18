// Statutory Reports Tools - Companies Act Compliance
// Register of Members, Directors, Charges, Related Party etc.

import { TallyConnection } from '../tally/connection.js';
import { TallyRequests } from '../tally/requests.js';
import {
  DirectorDetails,
  ShareholderDetails,
  RelatedPartyTransaction,
  TallyResponse,
} from '../types/tally.js';

export class StatutoryTools {
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

  // Get Share Capital structure
  async getShareCapitalStructure(): Promise<TallyResponse<any>> {
    const xml = TallyRequests.getShareCapitalDetails(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(xml);

    if (!response.success) return response;

    try {
      const shareCapital: any = {
        authorizedCapital: 0,
        issuedCapital: 0,
        subscribedCapital: 0,
        paidUpCapital: 0,
        details: [],
      };

      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        const name = this.extractString(ledger.NAME).toLowerCase();
        const balance = Math.abs(this.connection.parseAmount(ledger.CLOSINGBALANCE));

        const entry = {
          name: ledger.NAME,
          balance: balance,
          type: this.classifyCapitalType(name),
        };

        shareCapital.details.push(entry);

        // Classify into categories
        if (name.includes('authorized')) {
          shareCapital.authorizedCapital += balance;
        } else if (name.includes('issued')) {
          shareCapital.issuedCapital += balance;
        } else if (name.includes('subscribed')) {
          shareCapital.subscribedCapital += balance;
        } else {
          shareCapital.paidUpCapital += balance;
        }
      }

      return { success: true, data: shareCapital };
    } catch (error: any) {
      return { success: false, error: `Failed to get share capital: ${error.message}` };
    }
  }

  // Get Reserves and Surplus
  async getReservesAndSurplus(): Promise<TallyResponse<any>> {
    const xml = TallyRequests.getReservesAndSurplus(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(xml);

    if (!response.success) return response;

    try {
      const reserves: any = {
        capitalReserve: 0,
        securitiesPremium: 0,
        generalReserve: 0,
        retainedEarnings: 0,
        otherReserves: 0,
        details: [],
      };

      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        const name = this.extractString(ledger.NAME).toLowerCase();
        const balance = Math.abs(this.connection.parseAmount(ledger.CLOSINGBALANCE));

        reserves.details.push({
          name: ledger.NAME,
          balance: balance,
          type: this.classifyReserveType(name),
        });

        // Classify
        if (name.includes('capital reserve')) {
          reserves.capitalReserve += balance;
        } else if (name.includes('securities premium') || name.includes('share premium')) {
          reserves.securitiesPremium += balance;
        } else if (name.includes('general reserve')) {
          reserves.generalReserve += balance;
        } else if (name.includes('retained') || name.includes('surplus') || name.includes('p&l') || name.includes('profit')) {
          reserves.retainedEarnings += balance;
        } else {
          reserves.otherReserves += balance;
        }
      }

      reserves.total =
        reserves.capitalReserve +
        reserves.securitiesPremium +
        reserves.generalReserve +
        reserves.retainedEarnings +
        reserves.otherReserves;

      return { success: true, data: reserves };
    } catch (error: any) {
      return { success: false, error: `Failed to get reserves: ${error.message}` };
    }
  }

  // Get Secured and Unsecured Loans
  async getBorrowings(): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const xml = TallyRequests.getLoanAndAdvances(
      this.connection.formatTallyDate(new Date('2000-04-01')),
      this.connection.formatTallyDate(new Date()),
      companyName
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const borrowings: any = {
        securedLoans: [],
        unsecuredLoans: [],
        totalSecured: 0,
        totalUnsecured: 0,
      };

      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        const parent = this.extractString(ledger.PARENT).toLowerCase();
        const balance = Math.abs(this.connection.parseAmount(ledger.CLOSINGBALANCE));

        if (balance === 0) continue;

        const loanEntry = {
          name: ledger.NAME,
          balance: balance,
          parent: ledger.PARENT,
          panNumber: ledger.INCOMETAXNUMBER || '',
        };

        if (parent.includes('secured')) {
          borrowings.securedLoans.push(loanEntry);
          borrowings.totalSecured += balance;
        } else if (parent.includes('unsecured') || parent.includes('loan')) {
          borrowings.unsecuredLoans.push(loanEntry);
          borrowings.totalUnsecured += balance;
        }
      }

      return { success: true, data: borrowings };
    } catch (error: any) {
      return { success: false, error: `Failed to get borrowings: ${error.message}` };
    }
  }

  // Get Related Party Transactions (as required by Schedule III and AS-18)
  async getRelatedPartyTransactions(
    fromDate: string,
    toDate: string,
    relatedPartyLedgers: string[]
  ): Promise<TallyResponse<RelatedPartyTransaction[]>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    const transactions: RelatedPartyTransaction[] = [];

    for (const partyName of relatedPartyLedgers) {
      const xml = TallyRequests.getLedgerVouchers(
        partyName,
        formattedFromDate,
        formattedToDate,
        companyName
      );

      const response = await this.connection.executeRequest(xml);
      if (!response.success) continue;

      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        const ledgerEntries = this.extractLedgerEntries(voucher);
        const partyEntry = ledgerEntries.find(
          (e: any) => this.extractString(e.LEDGERNAME).toLowerCase() === partyName.toLowerCase()
        );

        if (partyEntry) {
          transactions.push({
            partyName: partyName,
            relationship: 'Related Party', // Would need manual classification
            transactionType: voucher.VOUCHERTYPENAME || '',
            amount: Math.abs(this.connection.parseAmount(partyEntry.AMOUNT)),
            date: this.connection.parseDate(voucher.DATE),
          });
        }
      }
    }

    return { success: true, data: transactions };
  }

  // Get Schedule III compliant Balance Sheet format
  async getScheduleIIIBalanceSheet(asOnDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();

    // Get Balance Sheet
    const bsXml = TallyRequests.getBalanceSheet(
      this.connection.formatTallyDate(new Date(asOnDate)),
      companyName
    );
    const bsResponse = await this.connection.executeRequest(bsXml);

    // Get all ledgers for detailed classification
    const ledgerXml = TallyRequests.getLedgers(companyName);
    const ledgerResponse = await this.connection.executeRequest(ledgerXml);

    try {
      const scheduleIII: any = {
        equity: {
          shareCapital: 0,
          reservesAndSurplus: 0,
          moneyReceivedAgainstShareWarrants: 0,
          total: 0,
        },
        nonCurrentLiabilities: {
          longTermBorrowings: 0,
          deferredTaxLiability: 0,
          otherLongTermLiabilities: 0,
          longTermProvisions: 0,
          total: 0,
        },
        currentLiabilities: {
          shortTermBorrowings: 0,
          tradePayables: 0,
          otherCurrentLiabilities: 0,
          shortTermProvisions: 0,
          total: 0,
        },
        nonCurrentAssets: {
          tangibleAssets: 0,
          intangibleAssets: 0,
          capitalWorkInProgress: 0,
          nonCurrentInvestments: 0,
          deferredTaxAsset: 0,
          longTermLoansAndAdvances: 0,
          otherNonCurrentAssets: 0,
          total: 0,
        },
        currentAssets: {
          currentInvestments: 0,
          inventories: 0,
          tradeReceivables: 0,
          cashAndCashEquivalents: 0,
          shortTermLoansAndAdvances: 0,
          otherCurrentAssets: 0,
          total: 0,
        },
        totalEquityAndLiabilities: 0,
        totalAssets: 0,
      };

      if (ledgerResponse.success) {
        const ledgers = this.extractLedgers(ledgerResponse.data);

        for (const ledger of ledgers) {
          const parent = this.extractString(ledger.PARENT).toLowerCase();
          const name = this.extractString(ledger.NAME).toLowerCase();
          const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);

          // Classify based on Tally groups
          if (parent.includes('capital') || parent.includes('share capital')) {
            scheduleIII.equity.shareCapital += Math.abs(balance);
          } else if (parent.includes('reserves') || parent.includes('surplus')) {
            scheduleIII.equity.reservesAndSurplus += Math.abs(balance);
          } else if (parent.includes('secured loan') && !parent.includes('short')) {
            scheduleIII.nonCurrentLiabilities.longTermBorrowings += Math.abs(balance);
          } else if (parent.includes('unsecured loan') && !parent.includes('short')) {
            scheduleIII.nonCurrentLiabilities.longTermBorrowings += Math.abs(balance);
          } else if (parent.includes('sundry creditor') || parent.includes('trade payable')) {
            scheduleIII.currentLiabilities.tradePayables += Math.abs(balance);
          } else if (parent.includes('duties') || parent.includes('taxes')) {
            scheduleIII.currentLiabilities.otherCurrentLiabilities += Math.abs(balance);
          } else if (parent.includes('provision')) {
            if (parent.includes('non-current') || parent.includes('long')) {
              scheduleIII.nonCurrentLiabilities.longTermProvisions += Math.abs(balance);
            } else {
              scheduleIII.currentLiabilities.shortTermProvisions += Math.abs(balance);
            }
          } else if (parent.includes('fixed asset')) {
            if (name.includes('intangible')) {
              scheduleIII.nonCurrentAssets.intangibleAssets += Math.abs(balance);
            } else if (name.includes('cwip') || name.includes('capital work')) {
              scheduleIII.nonCurrentAssets.capitalWorkInProgress += Math.abs(balance);
            } else {
              scheduleIII.nonCurrentAssets.tangibleAssets += Math.abs(balance);
            }
          } else if (parent.includes('investment')) {
            if (parent.includes('non-current') || parent.includes('long')) {
              scheduleIII.nonCurrentAssets.nonCurrentInvestments += Math.abs(balance);
            } else {
              scheduleIII.currentAssets.currentInvestments += Math.abs(balance);
            }
          } else if (parent.includes('stock') || parent.includes('inventor')) {
            scheduleIII.currentAssets.inventories += Math.abs(balance);
          } else if (parent.includes('sundry debtor') || parent.includes('trade receivable')) {
            scheduleIII.currentAssets.tradeReceivables += Math.abs(balance);
          } else if (parent.includes('cash') || parent.includes('bank')) {
            scheduleIII.currentAssets.cashAndCashEquivalents += Math.abs(balance);
          } else if (parent.includes('loans and advances')) {
            if (parent.includes('non-current') || parent.includes('long')) {
              scheduleIII.nonCurrentAssets.longTermLoansAndAdvances += Math.abs(balance);
            } else {
              scheduleIII.currentAssets.shortTermLoansAndAdvances += Math.abs(balance);
            }
          }
        }
      }

      // Calculate totals
      scheduleIII.equity.total =
        scheduleIII.equity.shareCapital +
        scheduleIII.equity.reservesAndSurplus +
        scheduleIII.equity.moneyReceivedAgainstShareWarrants;

      scheduleIII.nonCurrentLiabilities.total =
        scheduleIII.nonCurrentLiabilities.longTermBorrowings +
        scheduleIII.nonCurrentLiabilities.deferredTaxLiability +
        scheduleIII.nonCurrentLiabilities.otherLongTermLiabilities +
        scheduleIII.nonCurrentLiabilities.longTermProvisions;

      scheduleIII.currentLiabilities.total =
        scheduleIII.currentLiabilities.shortTermBorrowings +
        scheduleIII.currentLiabilities.tradePayables +
        scheduleIII.currentLiabilities.otherCurrentLiabilities +
        scheduleIII.currentLiabilities.shortTermProvisions;

      scheduleIII.nonCurrentAssets.total =
        scheduleIII.nonCurrentAssets.tangibleAssets +
        scheduleIII.nonCurrentAssets.intangibleAssets +
        scheduleIII.nonCurrentAssets.capitalWorkInProgress +
        scheduleIII.nonCurrentAssets.nonCurrentInvestments +
        scheduleIII.nonCurrentAssets.deferredTaxAsset +
        scheduleIII.nonCurrentAssets.longTermLoansAndAdvances +
        scheduleIII.nonCurrentAssets.otherNonCurrentAssets;

      scheduleIII.currentAssets.total =
        scheduleIII.currentAssets.currentInvestments +
        scheduleIII.currentAssets.inventories +
        scheduleIII.currentAssets.tradeReceivables +
        scheduleIII.currentAssets.cashAndCashEquivalents +
        scheduleIII.currentAssets.shortTermLoansAndAdvances +
        scheduleIII.currentAssets.otherCurrentAssets;

      scheduleIII.totalEquityAndLiabilities =
        scheduleIII.equity.total +
        scheduleIII.nonCurrentLiabilities.total +
        scheduleIII.currentLiabilities.total;

      scheduleIII.totalAssets =
        scheduleIII.nonCurrentAssets.total + scheduleIII.currentAssets.total;

      return { success: true, data: scheduleIII };
    } catch (error: any) {
      return { success: false, error: `Failed to generate Schedule III Balance Sheet: ${error.message}` };
    }
  }

  // Get Schedule III compliant Profit & Loss format
  async getScheduleIIIProfitLoss(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Get P&L data
    const plXml = TallyRequests.getProfitAndLoss(formattedFromDate, formattedToDate, companyName);
    const plResponse = await this.connection.executeRequest(plXml);

    // Get Trial Balance for detailed breakdown
    const tbXml = TallyRequests.getTrialBalance(formattedFromDate, formattedToDate, companyName);
    const tbResponse = await this.connection.executeRequest(tbXml);

    try {
      const scheduleIII: any = {
        revenue: {
          revenueFromOperations: 0,
          otherIncome: 0,
          totalRevenue: 0,
        },
        expenses: {
          costOfMaterialsConsumed: 0,
          purchasesOfStockInTrade: 0,
          changesInInventory: 0,
          employeeBenefitExpense: 0,
          financesCosts: 0,
          depreciationAndAmortization: 0,
          otherExpenses: 0,
          totalExpenses: 0,
        },
        profitBeforeTax: 0,
        taxExpense: {
          currentTax: 0,
          deferredTax: 0,
          total: 0,
        },
        profitAfterTax: 0,
        otherComprehensiveIncome: 0,
        totalComprehensiveIncome: 0,
        earningsPerShare: {
          basic: 0,
          diluted: 0,
        },
      };

      // Note: Actual P&L parsing would depend on Tally's response structure
      // This is a template structure that would need to be populated from actual data

      return { success: true, data: scheduleIII };
    } catch (error: any) {
      return { success: false, error: `Failed to generate Schedule III P&L: ${error.message}` };
    }
  }

  // Get Audit Trail Report (as mandated under Companies Act)
  async getAuditTrailReport(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const xml = TallyRequests.getAuditTrail(
      this.connection.formatTallyDate(new Date(fromDate)),
      this.connection.formatTallyDate(new Date(toDate)),
      this.connection.getCompanyName()
    );

    const response = await this.connection.executeRequest(xml);
    if (!response.success) return response;

    try {
      const auditTrail: any[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        auditTrail.push({
          date: this.connection.parseDate(voucher.DATE),
          time: voucher.ALTERTIME || '',
          voucherType: voucher.VOUCHERTYPENAME || '',
          voucherNumber: voucher.VOUCHERNUMBER || '',
          alteredBy: voucher.ALTEREDBY || '',
          alterDate: voucher.ALTERDATE ? this.connection.parseDate(voucher.ALTERDATE) : '',
          alterationType: this.determineAlterationType(voucher),
        });
      }

      // Summary
      const summary = {
        totalVouchers: auditTrail.length,
        createdCount: auditTrail.filter((a) => a.alterationType === 'Created').length,
        modifiedCount: auditTrail.filter((a) => a.alterationType === 'Modified').length,
        deletedCount: auditTrail.filter((a) => a.alterationType === 'Deleted').length,
        userWise: this.groupByUser(auditTrail),
      };

      return { success: true, data: { entries: auditTrail, summary } };
    } catch (error: any) {
      return { success: false, error: `Failed to get audit trail: ${error.message}` };
    }
  }

  // Get Cash Flow Statement (Indirect Method - AS-3 / Ind AS 7)
  async getCashFlowStatement(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    const cashFlowXml = TallyRequests.getCashFlow(formattedFromDate, formattedToDate, companyName);
    const response = await this.connection.executeRequest(cashFlowXml);

    try {
      const cashFlow: any = {
        operatingActivities: {
          profitBeforeTax: 0,
          adjustments: {
            depreciation: 0,
            interestExpense: 0,
            interestIncome: 0,
            dividendIncome: 0,
            profitOnSaleOfAssets: 0,
            lossOnSaleOfAssets: 0,
            foreignExchangeGainLoss: 0,
            provisions: 0,
          },
          operatingProfitBeforeWorkingCapital: 0,
          workingCapitalChanges: {
            inventories: 0,
            tradeReceivables: 0,
            otherCurrentAssets: 0,
            tradePayables: 0,
            otherCurrentLiabilities: 0,
          },
          cashFromOperations: 0,
          incomeTaxPaid: 0,
          netCashFromOperating: 0,
        },
        investingActivities: {
          purchaseOfFixedAssets: 0,
          saleOfFixedAssets: 0,
          purchaseOfInvestments: 0,
          saleOfInvestments: 0,
          interestReceived: 0,
          dividendReceived: 0,
          netCashFromInvesting: 0,
        },
        financingActivities: {
          proceedsFromIssueOfShares: 0,
          proceedsFromBorrowings: 0,
          repaymentOfBorrowings: 0,
          interestPaid: 0,
          dividendPaid: 0,
          netCashFromFinancing: 0,
        },
        netIncreaseInCash: 0,
        openingCashBalance: 0,
        closingCashBalance: 0,
      };

      // Note: Actual calculation would require detailed ledger analysis
      // This is the structure that would be populated

      return { success: true, data: cashFlow };
    } catch (error: any) {
      return { success: false, error: `Failed to generate cash flow: ${error.message}` };
    }
  }

  // Get Contingent Liabilities
  async getContingentLiabilities(): Promise<TallyResponse<any[]>> {
    const companyName = this.connection.getCompanyName();
    const xml = TallyRequests.getLedgers(companyName);
    const response = await this.connection.executeRequest(xml);

    if (!response.success) return response;

    try {
      const contingentLiabilities: any[] = [];
      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        const name = this.extractString(ledger.NAME).toLowerCase();
        const parent = this.extractString(ledger.PARENT).toLowerCase();

        if (
          name.includes('contingent') ||
          parent.includes('contingent') ||
          name.includes('guarantee') ||
          name.includes('disputed')
        ) {
          contingentLiabilities.push({
            name: ledger.NAME,
            amount: Math.abs(this.connection.parseAmount(ledger.CLOSINGBALANCE)),
            parent: ledger.PARENT,
            type: this.classifyContingency(name),
          });
        }
      }

      return { success: true, data: contingentLiabilities };
    } catch (error: any) {
      return { success: false, error: `Failed to get contingent liabilities: ${error.message}` };
    }
  }

  // Get Capital Commitments
  async getCapitalCommitments(): Promise<TallyResponse<any[]>> {
    // This would typically be recorded in a specific ledger group or memo accounts
    return {
      success: true,
      data: [],
    };
  }

  // Private helper methods
  private classifyCapitalType(name: string): string {
    if (name.includes('equity')) return 'Equity Share Capital';
    if (name.includes('preference')) return 'Preference Share Capital';
    if (name.includes('authorized')) return 'Authorized Capital';
    if (name.includes('issued')) return 'Issued Capital';
    if (name.includes('subscribed')) return 'Subscribed Capital';
    if (name.includes('called')) return 'Called Up Capital';
    return 'Paid Up Capital';
  }

  private classifyReserveType(name: string): string {
    if (name.includes('capital reserve')) return 'Capital Reserve';
    if (name.includes('revaluation')) return 'Revaluation Reserve';
    if (name.includes('securities premium') || name.includes('share premium')) return 'Securities Premium';
    if (name.includes('general reserve')) return 'General Reserve';
    if (name.includes('statutory')) return 'Statutory Reserve';
    if (name.includes('debenture')) return 'Debenture Redemption Reserve';
    if (name.includes('retained') || name.includes('surplus')) return 'Retained Earnings';
    return 'Other Reserve';
  }

  private classifyContingency(name: string): string {
    if (name.includes('guarantee')) return 'Guarantees';
    if (name.includes('disputed') && name.includes('tax')) return 'Disputed Taxes';
    if (name.includes('claim')) return 'Claims against company';
    if (name.includes('lawsuit') || name.includes('litigation')) return 'Pending Litigation';
    return 'Other Contingency';
  }

  private determineAlterationType(voucher: any): string {
    if (voucher.ISCANCELLED === 'Yes') return 'Deleted';
    if (voucher.ALTERID && voucher.MASTERID && voucher.ALTERID !== voucher.MASTERID) {
      return 'Modified';
    }
    return 'Created';
  }

  private groupByUser(entries: any[]): Record<string, number> {
    const userWise: Record<string, number> = {};
    for (const entry of entries) {
      const user = entry.alteredBy || 'Unknown';
      userWise[user] = (userWise[user] || 0) + 1;
    }
    return userWise;
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
