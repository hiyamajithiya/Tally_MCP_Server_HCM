// GST Tools for GSTR-1, 2A, 2B, 3B Reconciliation
// Compliance with GST Act requirements

import { TallyConnection } from '../tally/connection.js';
import { TallyRequests } from '../tally/requests.js';
import {
  GSTTransaction,
  GSTR1Summary,
  GSTReconciliation,
  HSNSummary,
  TallyResponse,
} from '../types/tally.js';

export class GSTTools {
  private connection: TallyConnection;

  constructor(connection: TallyConnection) {
    this.connection = connection;
  }

  // Get GSTR-1 data from Tally (Outward Supplies)
  async getGSTR1Data(fromDate: string, toDate: string): Promise<TallyResponse<GSTR1Summary>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Use Collection with NATIVEMETHOD which works with TallyPrime 6.x
    const salesXml = TallyRequests.getVouchersCollection(formattedFromDate, formattedToDate, companyName);
    const salesResponse = await this.connection.executeRequest(salesXml);

    if (!salesResponse.success) return salesResponse;

    try {
      const gstr1: GSTR1Summary = {
        b2b: [],      // B2B invoices (registered parties)
        b2cl: [],     // B2C Large (inter-state > 2.5 lakh)
        b2cs: [],     // B2C Small (intra-state and inter-state <= 2.5 lakh)
        cdnr: [],     // Credit/Debit notes to registered
        cdnur: [],    // Credit/Debit notes to unregistered
        exports: [],  // Export invoices
        hsn: [],      // HSN Summary
        documents: [], // Document Summary
      };

      const allVouchers = this.extractVouchers(salesResponse.data);

      for (const voucher of allVouchers) {
        // Skip optional and cancelled vouchers (filter in code for TallyPrime 6.x compatibility)
        const isOptional = this.extractString(voucher.ISOPTIONAL || voucher.IsOptional).toLowerCase();
        const isCancelled = this.extractString(voucher.ISCANCELLED || voucher.IsCancelled).toLowerCase();
        if (isOptional === 'yes' || isCancelled === 'yes') {
          continue;
        }

        const voucherType = this.extractString(voucher.VOUCHERTYPENAME || voucher.VoucherTypeName).toLowerCase();
        const transaction = this.parseGSTTransaction(voucher);

        // Check if it's a Credit Note or Debit Note
        if (voucherType.includes('credit note') || voucherType.includes('debit note')) {
          transaction.invoiceValue = -Math.abs(transaction.invoiceValue); // Negative for CN/DN

          if (transaction.partyGSTIN && transaction.partyGSTIN.length === 15) {
            gstr1.cdnr.push(transaction);
          } else {
            gstr1.cdnur.push(transaction);
          }
          continue;
        }

        // Only process Sales vouchers for B2B/B2C
        if (!voucherType.includes('sales')) {
          continue;
        }

        if (transaction.partyGSTIN && transaction.partyGSTIN.length === 15) {
          // B2B - Registered party
          gstr1.b2b.push(transaction);
        } else if (!transaction.partyGSTIN || transaction.partyGSTIN.length !== 15) {
          // Unregistered party
          const isInterState = this.isInterStateSupply(transaction.placeOfSupply);

          if (isInterState && transaction.invoiceValue > 250000) {
            // B2CL - Inter-state > 2.5 lakh
            gstr1.b2cl.push(transaction);
          } else {
            // B2CS - All other unregistered
            gstr1.b2cs.push(transaction);
          }
        }

        // Check for exports
        if (transaction.placeOfSupply === '96-Other Countries' || transaction.placeOfSupply?.includes('Export')) {
          gstr1.exports.push(transaction);
        }
      }

      // Generate HSN Summary
      gstr1.hsn = await this.getHSNSummary(fromDate, toDate);

      return { success: true, data: gstr1 };
    } catch (error: any) {
      return { success: false, error: `Failed to generate GSTR-1 data: ${error.message}` };
    }
  }

  // Get GSTR-3B Summary data
  async getGSTR3BData(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Use Collection with NATIVEMETHOD which works with TallyPrime 6.x (same as GSTR-1)
    const vouchersXml = TallyRequests.getVouchersCollection(formattedFromDate, formattedToDate, companyName);
    const vouchersResponse = await this.connection.executeRequest(vouchersXml);

    try {
      const gstr3b = {
        // 3.1 - Outward Supplies
        table31: {
          outwardTaxableSupplies: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
          outwardTaxableZeroRated: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
          otherOutwardSupplies: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
          inwardSuppliesRCM: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
          nonGSTOutwardSupplies: { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
        },
        // 3.2 - Inter-state supplies to unregistered
        table32: {
          unregisteredPersons: [] as { placeOfSupply: string; taxableValue: number; igst: number }[],
          compositionDealers: [] as { placeOfSupply: string; taxableValue: number; igst: number }[],
          uinHolders: [] as { placeOfSupply: string; taxableValue: number; igst: number }[],
        },
        // 4 - Eligible ITC
        table4: {
          itcAvailable: {
            imports: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
            importOfServices: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
            inwardSuppliesRCM: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
            inwardSuppliesISD: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
            allOtherITC: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          },
          itcReversed: {
            asPerRules: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
            others: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          },
          netITC: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
          ineligibleITC: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
        },
        // 5 - Values of exempt, nil-rated and non-GST supplies
        table5: {
          interStateToRegistered: 0,
          interStateToUnregistered: 0,
          intraStateToRegistered: 0,
          intraStateToUnregistered: 0,
        },
        // 6.1 - Payment of Tax
        table61: {
          igst: { taxPayable: 0, paidThroughITC: 0, paidInCash: 0 },
          cgst: { taxPayable: 0, paidThroughITC: 0, paidInCash: 0 },
          sgst: { taxPayable: 0, paidThroughITC: 0, paidInCash: 0 },
          cess: { taxPayable: 0, paidThroughITC: 0, paidInCash: 0 },
        },
      };

      // Process all vouchers from Collection response
      if (vouchersResponse.success) {
        const allVouchers = this.extractVouchers(vouchersResponse.data);

        for (const voucher of allVouchers) {
          // Skip optional and cancelled vouchers (filter in code for TallyPrime 6.x compatibility)
          const isOptional = this.extractString(voucher.ISOPTIONAL || voucher.IsOptional).toLowerCase();
          const isCancelled = this.extractString(voucher.ISCANCELLED || voucher.IsCancelled).toLowerCase();
          if (isOptional === 'yes' || isCancelled === 'yes') {
            continue;
          }

          const voucherType = this.extractString(voucher.VOUCHERTYPENAME || voucher.VoucherTypeName).toLowerCase();
          const gstData = this.extractGSTAmounts(voucher);
          const isRCM = this.extractString(voucher.ISREVERSECHARGEAPPLICABLE) === 'Yes';

          // Process Sales vouchers for Table 3.1
          if (voucherType.includes('sales')) {
            gstr3b.table31.outwardTaxableSupplies.taxableValue += gstData.taxableValue;
            gstr3b.table31.outwardTaxableSupplies.igst += gstData.igst;
            gstr3b.table31.outwardTaxableSupplies.cgst += gstData.cgst;
            gstr3b.table31.outwardTaxableSupplies.sgst += gstData.sgst;
            gstr3b.table31.outwardTaxableSupplies.cess += gstData.cess;

            // Check for inter-state supplies to unregistered (Table 3.2)
            const partyGSTIN = this.extractString(voucher.PARTYGSTIN || voucher.PartyGSTIN);
            const placeOfSupply = this.extractString(voucher.PLACEOFSUPPLY || voucher.PlaceOfSupply);
            if (!partyGSTIN && gstData.igst > 0) {
              gstr3b.table32.unregisteredPersons.push({
                placeOfSupply: placeOfSupply,
                taxableValue: gstData.taxableValue,
                igst: gstData.igst,
              });
            }
          }

          // Process Credit/Debit Notes (reduce from outward supplies)
          if (voucherType.includes('credit note') || voucherType.includes('debit note')) {
            gstr3b.table31.outwardTaxableSupplies.taxableValue -= gstData.taxableValue;
            gstr3b.table31.outwardTaxableSupplies.igst -= gstData.igst;
            gstr3b.table31.outwardTaxableSupplies.cgst -= gstData.cgst;
            gstr3b.table31.outwardTaxableSupplies.sgst -= gstData.sgst;
            gstr3b.table31.outwardTaxableSupplies.cess -= gstData.cess;
          }

          // Process Purchase vouchers for Table 4 (ITC)
          if (voucherType.includes('purchase')) {
            if (isRCM) {
              gstr3b.table4.itcAvailable.inwardSuppliesRCM.igst += gstData.igst;
              gstr3b.table4.itcAvailable.inwardSuppliesRCM.cgst += gstData.cgst;
              gstr3b.table4.itcAvailable.inwardSuppliesRCM.sgst += gstData.sgst;
              gstr3b.table4.itcAvailable.inwardSuppliesRCM.cess += gstData.cess;

              // RCM also goes to Table 3.1(d)
              gstr3b.table31.inwardSuppliesRCM.taxableValue += gstData.taxableValue;
              gstr3b.table31.inwardSuppliesRCM.igst += gstData.igst;
              gstr3b.table31.inwardSuppliesRCM.cgst += gstData.cgst;
              gstr3b.table31.inwardSuppliesRCM.sgst += gstData.sgst;
              gstr3b.table31.inwardSuppliesRCM.cess += gstData.cess;
            } else {
              gstr3b.table4.itcAvailable.allOtherITC.igst += gstData.igst;
              gstr3b.table4.itcAvailable.allOtherITC.cgst += gstData.cgst;
              gstr3b.table4.itcAvailable.allOtherITC.sgst += gstData.sgst;
              gstr3b.table4.itcAvailable.allOtherITC.cess += gstData.cess;
            }
          }
        }
      }

      // Calculate Net ITC
      const itcAvailable = gstr3b.table4.itcAvailable;
      const itcReversed = gstr3b.table4.itcReversed;

      gstr3b.table4.netITC.igst =
        itcAvailable.imports.igst +
        itcAvailable.importOfServices.igst +
        itcAvailable.inwardSuppliesRCM.igst +
        itcAvailable.inwardSuppliesISD.igst +
        itcAvailable.allOtherITC.igst -
        itcReversed.asPerRules.igst -
        itcReversed.others.igst;

      gstr3b.table4.netITC.cgst =
        itcAvailable.imports.cgst +
        itcAvailable.allOtherITC.cgst -
        itcReversed.asPerRules.cgst -
        itcReversed.others.cgst;

      gstr3b.table4.netITC.sgst =
        itcAvailable.imports.sgst +
        itcAvailable.allOtherITC.sgst -
        itcReversed.asPerRules.sgst -
        itcReversed.others.sgst;

      // Calculate Tax Payable (Table 6.1)
      gstr3b.table61.igst.taxPayable = gstr3b.table31.outwardTaxableSupplies.igst;
      gstr3b.table61.cgst.taxPayable = gstr3b.table31.outwardTaxableSupplies.cgst;
      gstr3b.table61.sgst.taxPayable = gstr3b.table31.outwardTaxableSupplies.sgst;
      gstr3b.table61.cess.taxPayable = gstr3b.table31.outwardTaxableSupplies.cess;

      return { success: true, data: gstr3b };
    } catch (error: any) {
      return { success: false, error: `Failed to generate GSTR-3B data: ${error.message}` };
    }
  }

  // Reconcile Tally data with GSTR-2A/2B (uploaded data comparison)
  async reconcileWithGSTR2A(
    fromDate: string,
    toDate: string,
    gstr2aData: GSTTransaction[]
  ): Promise<TallyResponse<GSTReconciliation>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    // Get Purchase data from Tally
    const purchaseXml = TallyRequests.getGSTPurchaseRegister(formattedFromDate, formattedToDate, companyName);
    const purchaseResponse = await this.connection.executeRequest(purchaseXml);

    if (!purchaseResponse.success) return purchaseResponse;

    try {
      const reconciliation: GSTReconciliation = {
        matched: [],
        inTallyNotInReturn: [],
        inReturnNotInTally: [],
        amountMismatch: [],
        gstinMismatch: [],
      };

      const tallyTransactions: GSTTransaction[] = [];
      const purchaseVouchers = this.extractVouchers(purchaseResponse.data);

      for (const voucher of purchaseVouchers) {
        tallyTransactions.push(this.parseGSTTransaction(voucher));
      }

      // Create maps for comparison
      const tallyMap = new Map<string, GSTTransaction>();
      const returnMap = new Map<string, GSTTransaction>();

      for (const txn of tallyTransactions) {
        const key = this.createMatchKey(txn);
        tallyMap.set(key, txn);
      }

      for (const txn of gstr2aData) {
        const key = this.createMatchKey(txn);
        returnMap.set(key, txn);
      }

      // Find matches and mismatches
      for (const [key, tallyTxn] of tallyMap) {
        const returnTxn = returnMap.get(key);

        if (returnTxn) {
          // Check for amount mismatch
          if (Math.abs(tallyTxn.invoiceValue - returnTxn.invoiceValue) > 1) {
            reconciliation.amountMismatch.push({
              tallyTransaction: tallyTxn,
              returnTransaction: returnTxn,
              mismatchType: 'Invoice Value Mismatch',
              tallyValue: tallyTxn.invoiceValue,
              returnValue: returnTxn.invoiceValue,
            });
          } else if (Math.abs(tallyTxn.totalTax - returnTxn.totalTax) > 1) {
            reconciliation.amountMismatch.push({
              tallyTransaction: tallyTxn,
              returnTransaction: returnTxn,
              mismatchType: 'Tax Amount Mismatch',
              tallyValue: tallyTxn.totalTax,
              returnValue: returnTxn.totalTax,
            });
          } else {
            reconciliation.matched.push(tallyTxn);
          }
          returnMap.delete(key);
        } else {
          // Try fuzzy match by GSTIN + approximate date
          const fuzzyMatch = this.findFuzzyMatch(tallyTxn, Array.from(returnMap.values()));
          if (fuzzyMatch) {
            reconciliation.amountMismatch.push({
              tallyTransaction: tallyTxn,
              returnTransaction: fuzzyMatch,
              mismatchType: 'Invoice Number/Date Mismatch',
              tallyValue: `${tallyTxn.invoiceNumber} / ${tallyTxn.invoiceDate}`,
              returnValue: `${fuzzyMatch.invoiceNumber} / ${fuzzyMatch.invoiceDate}`,
            });
          } else {
            reconciliation.inTallyNotInReturn.push(tallyTxn);
          }
        }
      }

      // Remaining in return but not in Tally
      for (const [, returnTxn] of returnMap) {
        reconciliation.inReturnNotInTally.push(returnTxn);
      }

      return { success: true, data: reconciliation };
    } catch (error: any) {
      return { success: false, error: `Failed to reconcile with GSTR-2A: ${error.message}` };
    }
  }

  // Reconcile GSTR-1 (Sales) with GSTR-3B
  async reconcileGSTR1WithGSTR3B(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const [gstr1Result, gstr3bResult] = await Promise.all([
      this.getGSTR1Data(fromDate, toDate),
      this.getGSTR3BData(fromDate, toDate),
    ]);

    if (!gstr1Result.success) return gstr1Result;
    if (!gstr3bResult.success) return gstr3bResult;

    try {
      const gstr1 = gstr1Result.data!;
      const gstr3b = gstr3bResult.data;

      // Calculate GSTR-1 totals
      const gstr1Totals = {
        taxableValue: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      };

      const allGstr1Txns = [...gstr1.b2b, ...gstr1.b2cl, ...gstr1.b2cs];
      for (const txn of allGstr1Txns) {
        gstr1Totals.taxableValue += txn.taxableValue;
        gstr1Totals.igst += txn.igst;
        gstr1Totals.cgst += txn.cgst;
        gstr1Totals.sgst += txn.sgst;
        gstr1Totals.cess += txn.cess;
      }

      // Compare with GSTR-3B
      const gstr3bTotals = gstr3b.table31.outwardTaxableSupplies;

      const differences = {
        taxableValue: gstr1Totals.taxableValue - gstr3bTotals.taxableValue,
        igst: gstr1Totals.igst - gstr3bTotals.igst,
        cgst: gstr1Totals.cgst - gstr3bTotals.cgst,
        sgst: gstr1Totals.sgst - gstr3bTotals.sgst,
        cess: gstr1Totals.cess - gstr3bTotals.cess,
      };

      return {
        success: true,
        data: {
          gstr1Totals,
          gstr3bTotals,
          differences,
          isReconciled:
            Math.abs(differences.taxableValue) < 1 &&
            Math.abs(differences.igst) < 1 &&
            Math.abs(differences.cgst) < 1 &&
            Math.abs(differences.sgst) < 1,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to reconcile GSTR-1 with GSTR-3B: ${error.message}` };
    }
  }

  // Get GST Ledger Summary
  async getGSTLedgerSummary(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const xml = TallyRequests.getLedgers(companyName);
    const response = await this.connection.executeRequest(xml);

    if (!response.success) return response;

    try {
      const gstLedgers: any = {
        outputTax: [],
        inputTax: [],
        rcmLiability: [],
        tdsGst: [],
        tcsGst: [],
      };

      const ledgers = this.extractLedgers(response.data);

      for (const ledger of ledgers) {
        const name = this.extractString(ledger.NAME).toLowerCase();
        const parent = this.extractString(ledger.PARENT).toLowerCase();
        const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);

        if (parent.includes('duties & taxes') || parent.includes('duties and taxes')) {
          const ledgerInfo = {
            name: ledger.NAME,
            balance: balance,
            parent: ledger.PARENT,
          };

          if (name.includes('output') || name.includes('payable')) {
            if (name.includes('igst')) gstLedgers.outputTax.push({ ...ledgerInfo, type: 'IGST' });
            else if (name.includes('cgst')) gstLedgers.outputTax.push({ ...ledgerInfo, type: 'CGST' });
            else if (name.includes('sgst') || name.includes('utgst'))
              gstLedgers.outputTax.push({ ...ledgerInfo, type: 'SGST/UTGST' });
            else if (name.includes('cess')) gstLedgers.outputTax.push({ ...ledgerInfo, type: 'CESS' });
          } else if (name.includes('input') || name.includes('credit') || name.includes('receivable')) {
            if (name.includes('igst')) gstLedgers.inputTax.push({ ...ledgerInfo, type: 'IGST' });
            else if (name.includes('cgst')) gstLedgers.inputTax.push({ ...ledgerInfo, type: 'CGST' });
            else if (name.includes('sgst') || name.includes('utgst'))
              gstLedgers.inputTax.push({ ...ledgerInfo, type: 'SGST/UTGST' });
            else if (name.includes('cess')) gstLedgers.inputTax.push({ ...ledgerInfo, type: 'CESS' });
          } else if (name.includes('rcm') || name.includes('reverse charge')) {
            gstLedgers.rcmLiability.push(ledgerInfo);
          } else if (name.includes('tds') && name.includes('gst')) {
            gstLedgers.tdsGst.push(ledgerInfo);
          } else if (name.includes('tcs') && name.includes('gst')) {
            gstLedgers.tcsGst.push(ledgerInfo);
          }
        }
      }

      // Calculate totals
      const totals = {
        totalOutputIGST: gstLedgers.outputTax
          .filter((l: any) => l.type === 'IGST')
          .reduce((sum: number, l: any) => sum + l.balance, 0),
        totalOutputCGST: gstLedgers.outputTax
          .filter((l: any) => l.type === 'CGST')
          .reduce((sum: number, l: any) => sum + l.balance, 0),
        totalOutputSGST: gstLedgers.outputTax
          .filter((l: any) => l.type === 'SGST/UTGST')
          .reduce((sum: number, l: any) => sum + l.balance, 0),
        totalInputIGST: gstLedgers.inputTax
          .filter((l: any) => l.type === 'IGST')
          .reduce((sum: number, l: any) => sum + l.balance, 0),
        totalInputCGST: gstLedgers.inputTax
          .filter((l: any) => l.type === 'CGST')
          .reduce((sum: number, l: any) => sum + l.balance, 0),
        totalInputSGST: gstLedgers.inputTax
          .filter((l: any) => l.type === 'SGST/UTGST')
          .reduce((sum: number, l: any) => sum + l.balance, 0),
      };

      return {
        success: true,
        data: {
          ledgers: gstLedgers,
          totals,
          netLiability: {
            igst: totals.totalOutputIGST - totals.totalInputIGST,
            cgst: totals.totalOutputCGST - totals.totalInputCGST,
            sgst: totals.totalOutputSGST - totals.totalInputSGST,
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get GST ledger summary: ${error.message}` };
    }
  }

  // Get ITC Register (for ITC-04)
  async getITCRegister(fromDate: string, toDate: string): Promise<TallyResponse<any>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    const purchaseXml = TallyRequests.getGSTPurchaseRegister(formattedFromDate, formattedToDate, companyName);
    const response = await this.connection.executeRequest(purchaseXml);

    if (!response.success) return response;

    try {
      const itcRegister: any[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        const gstData = this.extractGSTAmounts(voucher);
        const isEligible = this.checkITCEligibility(voucher);

        itcRegister.push({
          date: this.connection.parseDate(voucher.DATE),
          voucherNumber: voucher.VOUCHERNUMBER || '',
          supplierName: voucher.PARTYLEDGERNAME || '',
          supplierGSTIN: voucher.PARTYGSTIN || '',
          invoiceNumber: voucher.REFERENCE || voucher.VOUCHERNUMBER,
          taxableValue: gstData.taxableValue,
          igst: gstData.igst,
          cgst: gstData.cgst,
          sgst: gstData.sgst,
          cess: gstData.cess,
          totalITC: gstData.igst + gstData.cgst + gstData.sgst + gstData.cess,
          isEligible: isEligible.eligible,
          ineligibilityReason: isEligible.reason,
          isRCM: voucher.ISREVERSECHARGEAPPLICABLE === 'Yes',
        });
      }

      // Summary
      const eligible = itcRegister.filter((r) => r.isEligible);
      const ineligible = itcRegister.filter((r) => !r.isEligible);

      return {
        success: true,
        data: {
          transactions: itcRegister,
          summary: {
            totalEligibleITC: eligible.reduce((sum, r) => sum + r.totalITC, 0),
            totalIneligibleITC: ineligible.reduce((sum, r) => sum + r.totalITC, 0),
            eligibleCount: eligible.length,
            ineligibleCount: ineligible.length,
            byType: {
              igst: eligible.reduce((sum, r) => sum + r.igst, 0),
              cgst: eligible.reduce((sum, r) => sum + r.cgst, 0),
              sgst: eligible.reduce((sum, r) => sum + r.sgst, 0),
              cess: eligible.reduce((sum, r) => sum + r.cess, 0),
            },
          },
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to get ITC register: ${error.message}` };
    }
  }

  // Get E-Way Bill data
  async getEWayBillData(fromDate: string, toDate: string): Promise<TallyResponse<any[]>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    const salesXml = TallyRequests.getGSTSalesRegister(formattedFromDate, formattedToDate, companyName);
    const response = await this.connection.executeRequest(salesXml);

    if (!response.success) return response;

    try {
      const ewayBills: any[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        const gstData = this.extractGSTAmounts(voucher);
        const invoiceValue = gstData.taxableValue + gstData.igst + gstData.cgst + gstData.sgst + gstData.cess;

        // E-Way bill required if value > 50,000
        if (invoiceValue >= 50000) {
          ewayBills.push({
            date: this.connection.parseDate(voucher.DATE),
            voucherNumber: voucher.VOUCHERNUMBER || '',
            partyName: voucher.PARTYLEDGERNAME || '',
            partyGSTIN: voucher.PARTYGSTIN || '',
            placeOfSupply: voucher.PLACEOFSUPPLY || '',
            invoiceValue: invoiceValue,
            ewayBillNumber: voucher.EWAYBILLNO || '',
            ewayBillRequired: true,
            ewayBillGenerated: !!voucher.EWAYBILLNO,
          });
        }
      }

      return { success: true, data: ewayBills };
    } catch (error: any) {
      return { success: false, error: `Failed to get E-Way bill data: ${error.message}` };
    }
  }

  // Get E-Invoice data
  async getEInvoiceData(fromDate: string, toDate: string): Promise<TallyResponse<any[]>> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    const salesXml = TallyRequests.getGSTSalesRegister(formattedFromDate, formattedToDate, companyName);
    const response = await this.connection.executeRequest(salesXml);

    if (!response.success) return response;

    try {
      const einvoices: any[] = [];
      const vouchers = this.extractVouchers(response.data);

      for (const voucher of vouchers) {
        // E-Invoice is mandatory for B2B transactions (where party has GSTIN)
        if (voucher.PARTYGSTIN && voucher.PARTYGSTIN.length === 15) {
          const gstData = this.extractGSTAmounts(voucher);

          einvoices.push({
            date: this.connection.parseDate(voucher.DATE),
            voucherNumber: voucher.VOUCHERNUMBER || '',
            partyName: voucher.PARTYLEDGERNAME || '',
            partyGSTIN: voucher.PARTYGSTIN || '',
            invoiceValue: gstData.taxableValue + gstData.igst + gstData.cgst + gstData.sgst + gstData.cess,
            irnNumber: voucher.IRNNUMBER || '',
            irnDate: voucher.IRNDATE || '',
            ackNumber: voucher.ACKNUMBER || '',
            einvoiceRequired: true,
            einvoiceGenerated: !!voucher.IRNNUMBER,
          });
        }
      }

      return { success: true, data: einvoices };
    } catch (error: any) {
      return { success: false, error: `Failed to get E-Invoice data: ${error.message}` };
    }
  }

  // Private helper methods
  private async getHSNSummary(fromDate: string, toDate: string): Promise<HSNSummary[]> {
    const companyName = this.connection.getCompanyName();
    const formattedFromDate = this.connection.formatTallyDate(new Date(fromDate));
    const formattedToDate = this.connection.formatTallyDate(new Date(toDate));

    const xml = TallyRequests.getHSNSummary(formattedFromDate, formattedToDate, companyName);
    const response = await this.connection.executeRequest(xml);

    if (!response.success) return [];

    const hsnMap = new Map<string, HSNSummary>();
    const stockItems = this.extractStockItems(response.data);

    for (const item of stockItems) {
      const hsnCode = item.HSNCODE || 'NA';
      const existing = hsnMap.get(hsnCode) || {
        hsnCode,
        description: item.NAME || '',
        uqc: item.BASEUNITS || 'NOS',
        totalQuantity: 0,
        totalValue: 0,
        taxableValue: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
      };

      existing.totalQuantity += this.connection.parseAmount(item.CLOSINGBALANCE);
      existing.totalValue += this.connection.parseAmount(item.CLOSINGVALUE);

      hsnMap.set(hsnCode, existing);
    }

    return Array.from(hsnMap.values());
  }

  // Helper to safely extract string value from Tally XML property (handles #text objects)
  private extractString(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (value['#text'] !== undefined) return String(value['#text']);
    return '';
  }

  private parseGSTTransaction(voucher: any): GSTTransaction {
    const gstData = this.extractGSTAmounts(voucher);

    return {
      voucherDate: this.connection.parseDate(voucher.DATE || voucher.Date),
      voucherNumber: this.extractString(voucher.VOUCHERNUMBER || voucher.VoucherNumber),
      voucherType: this.extractString(voucher.VOUCHERTYPENAME || voucher.VoucherTypeName),
      partyName: this.extractString(voucher.PARTYLEDGERNAME || voucher.PartyLedgerName),
      partyGSTIN: this.extractString(voucher.PARTYGSTIN || voucher.PartyGSTIN),
      placeOfSupply: this.extractString(voucher.PLACEOFSUPPLY || voucher.PlaceOfSupply),
      invoiceNumber: this.extractString(voucher.REFERENCE || voucher.Reference || voucher.VOUCHERNUMBER || voucher.VoucherNumber),
      invoiceDate: this.connection.parseDate(voucher.DATE || voucher.Date),
      taxableValue: gstData.taxableValue,
      igst: gstData.igst,
      cgst: gstData.cgst,
      sgst: gstData.sgst,
      cess: gstData.cess,
      totalTax: gstData.igst + gstData.cgst + gstData.sgst + gstData.cess,
      invoiceValue: gstData.taxableValue + gstData.igst + gstData.cgst + gstData.sgst + gstData.cess,
      isReverseCharge: this.extractString(voucher.ISREVERSECHARGEAPPLICABLE) === 'Yes',
      isAmended: false,
      eInvoiceNumber: this.extractString(voucher.IRNNUMBER),
      irnDate: this.extractString(voucher.IRNDATE),
    };
  }

  private extractGSTAmounts(voucher: any): {
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
  } {
    const result = { taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    const ledgerEntries = this.extractLedgerEntries(voucher);

    for (const entry of ledgerEntries) {
      // Handle LEDGERNAME as object (with #text) or string
      const rawLedgerName = entry.LEDGERNAME || entry.LedgerName || '';
      const ledgerName = this.extractString(rawLedgerName).toLowerCase();
      const amount = Math.abs(this.connection.parseAmount(entry.AMOUNT));

      if (ledgerName.includes('igst')) {
        result.igst += amount;
      } else if (ledgerName.includes('cgst')) {
        result.cgst += amount;
      } else if (ledgerName.includes('sgst') || ledgerName.includes('utgst')) {
        result.sgst += amount;
      } else if (ledgerName.includes('cess')) {
        result.cess += amount;
      } else if (
        !ledgerName.includes('tax') &&
        !ledgerName.includes('duty') &&
        !ledgerName.includes('round')
      ) {
        // Taxable value (non-tax ledgers)
        result.taxableValue += amount;
      }
    }

    return result;
  }

  private isInterStateSupply(placeOfSupply: string): boolean {
    // This would need company state to determine
    // For now, check if IGST is involved
    return placeOfSupply !== '' && !placeOfSupply.includes('Local');
  }

  private createMatchKey(txn: GSTTransaction): string {
    return `${txn.partyGSTIN}_${txn.invoiceNumber}_${txn.invoiceDate}`.toLowerCase();
  }

  private findFuzzyMatch(tallyTxn: GSTTransaction, returnTxns: GSTTransaction[]): GSTTransaction | null {
    for (const returnTxn of returnTxns) {
      if (
        tallyTxn.partyGSTIN === returnTxn.partyGSTIN &&
        Math.abs(tallyTxn.invoiceValue - returnTxn.invoiceValue) < 100
      ) {
        return returnTxn;
      }
    }
    return null;
  }

  private checkITCEligibility(voucher: any): { eligible: boolean; reason: string } {
    // Check various ITC eligibility rules
    const voucherType = voucher.VOUCHERTYPENAME || '';
    const narration = this.extractString(voucher.NARRATION).toLowerCase();

    // Blocked credits under Section 17(5)
    if (narration.includes('motor vehicle') || narration.includes('car')) {
      return { eligible: false, reason: 'Motor vehicle - blocked under Section 17(5)' };
    }
    if (narration.includes('food') || narration.includes('catering') || narration.includes('restaurant')) {
      return { eligible: false, reason: 'Food and beverages - blocked under Section 17(5)' };
    }
    if (narration.includes('membership') || narration.includes('club')) {
      return { eligible: false, reason: 'Club membership - blocked under Section 17(5)' };
    }
    if (narration.includes('personal')) {
      return { eligible: false, reason: 'Personal consumption - blocked under Section 17(5)' };
    }

    return { eligible: true, reason: '' };
  }

  private extractVouchers(data: any): any[] {
    if (!data) return [];

    // Handle different response structures from Tally
    const envelope = data?.ENVELOPE || data;

    // Try multiple paths where vouchers might be located
    // Collection format (TallyPrime 6.x) - VOUCHERCOLLECTION path
    let voucherData =
      envelope?.BODY?.DATA?.COLLECTION?.VOUCHERCOLLECTION?.VOUCHER ||
      envelope?.BODY?.DATA?.COLLECTION?.VOUCHER ||
      // Standard Export Data format paths
      envelope?.BODY?.DATA?.TALLYMESSAGE?.VOUCHER ||
      envelope?.BODY?.TALLYMESSAGE?.VOUCHER ||
      envelope?.TALLYMESSAGE?.VOUCHER ||
      // Import data paths
      envelope?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE?.VOUCHER ||
      // Report format paths (Voucher Register, Day Book)
      envelope?.BODY?.DATA?.VOUCHERREGISTER?.VOUCHER ||
      envelope?.BODY?.DATA?.DAYBOOK?.VOUCHER ||
      // TallyPrime 6.x Day Book specific paths
      envelope?.BODY?.DATA?.DSPVCHENTRY ||
      envelope?.BODY?.DATA?.DSPDAYBOOK?.DSPVCHENTRY ||
      envelope?.DSPVCHENTRY ||
      // Direct paths
      data?.BODY?.DATA?.COLLECTION?.VOUCHERCOLLECTION?.VOUCHER ||
      data?.BODY?.DATA?.COLLECTION?.VOUCHER ||
      data?.BODY?.TALLYMESSAGE?.VOUCHER ||
      data?.COLLECTION?.VOUCHERCOLLECTION?.VOUCHER ||
      data?.COLLECTION?.VOUCHER ||
      data?.TALLYMESSAGE?.VOUCHER ||
      data?.VOUCHER ||
      data?.DSPVCHENTRY;

    // If still not found, try to find VOUCHER or DSPVCHENTRY anywhere in the structure
    if (!voucherData) {
      voucherData = this.findVouchersDeep(data);
    }

    if (!voucherData) return [];
    return Array.isArray(voucherData) ? voucherData : [voucherData];
  }

  private findVouchersDeep(obj: any, depth: number = 0): any[] | null {
    if (depth > 6 || !obj || typeof obj !== 'object') return null;

    // Check for VOUCHER key
    if (obj.VOUCHER) {
      return Array.isArray(obj.VOUCHER) ? obj.VOUCHER : [obj.VOUCHER];
    }

    // Check for DSPVCHENTRY (TallyPrime 6.x Day Book format)
    if (obj.DSPVCHENTRY) {
      return Array.isArray(obj.DSPVCHENTRY) ? obj.DSPVCHENTRY : [obj.DSPVCHENTRY];
    }

    // Check for TALLYMESSAGE containing vouchers
    if (obj.TALLYMESSAGE) {
      const tm = obj.TALLYMESSAGE;
      // TALLYMESSAGE can be an array in Day Book response
      if (Array.isArray(tm)) {
        const allVouchers: any[] = [];
        for (const msg of tm) {
          if (msg.VOUCHER) {
            const v = Array.isArray(msg.VOUCHER) ? msg.VOUCHER : [msg.VOUCHER];
            allVouchers.push(...v);
          }
        }
        if (allVouchers.length > 0) return allVouchers;
      } else if (tm.VOUCHER) {
        return Array.isArray(tm.VOUCHER) ? tm.VOUCHER : [tm.VOUCHER];
      }
    }

    for (const key of Object.keys(obj)) {
      if (key === '#text' || key.startsWith('@_')) continue; // Skip text nodes and attributes
      const result = this.findVouchersDeep(obj[key], depth + 1);
      if (result && result.length > 0) return result;
    }

    return null;
  }

  private extractLedgerEntries(voucher: any): any[] {
    const entries =
      voucher['ALLLEDGERENTRIES.LIST'] ||
      voucher.ALLLEDGERENTRIES ||
      voucher['LEDGERENTRIES.LIST'] ||
      voucher.LEDGERENTRIES ||
      voucher.ALLLEDGERENTRIES_LIST ||
      voucher.LEDGERENTRIES_LIST;

    if (!entries) return [];

    // Handle nested structure
    if (entries.ALLLEDGERENTRIES) {
      const nested = entries.ALLLEDGERENTRIES;
      return Array.isArray(nested) ? nested : [nested];
    }
    if (entries.LEDGERENTRIES) {
      const nested = entries.LEDGERENTRIES;
      return Array.isArray(nested) ? nested : [nested];
    }

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
