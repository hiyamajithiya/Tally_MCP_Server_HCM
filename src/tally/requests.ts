// TDL Request Builders for various Tally data extractions
// These are optimized for Indian compliance requirements

export class TallyRequests {

  // ==================== MASTER DATA REQUESTS ====================

  static getLedgers(companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LedgerCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="LedgerCollection">
                <TYPE>Ledger</TYPE>
                <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, GSTREGISTRATIONTYPE, PARTYGSTIN, INCOMETAXNUMBER, LEDGERSTATENAME, PINCODE, ADDRESS, TANREGNO, ISTDSAPPLICABLE, TDSDEDUCTEETYPE</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getLedgerDetails(ledgerName: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Object</TYPE>
        <ID>LedgerObject</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVLEDGERNAME>${ledgerName}</SVLEDGERNAME>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <OBJECT NAME="LedgerObject" USING="Ledger">
                <LOCALFORMULA NAME="SVLEDGERNAME">$Name</LOCALFORMULA>
              </OBJECT>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getStockItems(companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>StockItemCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="StockItemCollection">
                <TYPE>StockItem</TYPE>
                <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, OPENINGVALUE, CLOSINGBALANCE, CLOSINGVALUE, HSNCODE, GSTRATE, BASEUNITS</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getGroups(companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>GroupCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="GroupCollection">
                <TYPE>Group</TYPE>
                <FETCH>NAME, GUID, PARENT, PRIMARYGROUP, ISUBTOTAL</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== VOUCHER REQUESTS ====================

  static getVouchers(fromDate: string, toDate: string, voucherType?: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    const voucherTypeFilter = voucherType ? `<VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>` : '';

    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>VoucherCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
            ${voucherTypeFilter}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="VoucherCollection">
                <TYPE>Voucher</TYPE>
                <CHILDOF>${voucherType || ''}</CHILDOF>
                <FETCH>*, ALLLEDGERENTRIES.*, ALLINVENTORYENTRIES.*, BILLALLOCATIONS.*</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getSalesVouchers(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Sales', companyName);
  }

  static getPurchaseVouchers(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Purchase', companyName);
  }

  static getPaymentVouchers(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Payment', companyName);
  }

  static getReceiptVouchers(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Receipt', companyName);
  }

  static getJournalVouchers(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Journal', companyName);
  }

  static getContraVouchers(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Contra', companyName);
  }

  static getCreditNotes(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Credit Note', companyName);
  }

  static getDebitNotes(fromDate: string, toDate: string, companyName?: string): string {
    return this.getVouchers(fromDate, toDate, 'Debit Note', companyName);
  }

  // ==================== GST SPECIFIC REQUESTS ====================

  // Helper to convert YYYYMMDD to DD-MMM-YYYY format that Tally expects
  private static formatDateForTally(dateStr: string): string {
    // Input: YYYYMMDD, Output: DD-MMM-YYYY
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = dateStr.substring(0, 4);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = dateStr.substring(6, 8);
    return `${day}-${months[month]}-${year}`;
  }

  // TallyPrime 6.x compatible: Export Sales Vouchers using Voucher Collection with FETCH
  static getGSTSalesRegister(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    const fromDateTally = this.formatDateForTally(fromDate);
    const toDateTally = this.formatDateForTally(toDate);

    return `<ENVELOPE>
<HEADER>
<VERSION>1</VERSION>
<TALLYREQUEST>Export</TALLYREQUEST>
<TYPE>Collection</TYPE>
<ID>CustomVoucherCollection</ID>
</HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
${companyVar}
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVFROMDATE>${fromDateTally}</SVFROMDATE>
<SVTODATE>${toDateTally}</SVTODATE>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="CustomVoucherCollection">
<TYPE>Voucher</TYPE>
<FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, AMOUNT, NARRATION, REFERENCE, PARTYGSTIN, PLACEOFSUPPLY, ISOPTIONAL, ISCANCELLED, ALLLEDGERENTRIES.LIST</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;
  }

  // TallyPrime 6.x compatible: Export All Vouchers using Voucher Collection with FETCH
  static getAllVouchers(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    const fromDateTally = this.formatDateForTally(fromDate);
    const toDateTally = this.formatDateForTally(toDate);

    return `<ENVELOPE>
<HEADER>
<VERSION>1</VERSION>
<TALLYREQUEST>Export</TALLYREQUEST>
<TYPE>Collection</TYPE>
<ID>AllVouchersCollection</ID>
</HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
${companyVar}
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVFROMDATE>${fromDateTally}</SVFROMDATE>
<SVTODATE>${toDateTally}</SVTODATE>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="AllVouchersCollection">
<TYPE>Voucher</TYPE>
<FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, AMOUNT, NARRATION, REFERENCE, PARTYGSTIN, PLACEOFSUPPLY, ISOPTIONAL, ISCANCELLED, ISREVERSECHARGEAPPLICABLE, ALLLEDGERENTRIES.LIST</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;
  }

  // TallyPrime 6.x: Using Collection with NATIVEMETHOD (working version from earlier session)
  static getVouchersCollection(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    const fromDateTally = this.formatDateForTally(fromDate);
    const toDateTally = this.formatDateForTally(toDate);

    // TallyPrime 6.x compatible format using NATIVEMETHOD with ISINITIALIZE="Yes"
    return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>MyVoucherCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        ${companyVar}
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${fromDateTally}</SVFROMDATE>
        <SVTODATE>${toDateTally}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="MyVoucherCollection" ISINITIALIZE="Yes">
            <TYPE>Voucher</TYPE>
            <NATIVEMETHOD>Date</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherNumber</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD>
            <NATIVEMETHOD>PartyLedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>Amount</NATIVEMETHOD>
            <NATIVEMETHOD>Narration</NATIVEMETHOD>
            <NATIVEMETHOD>Reference</NATIVEMETHOD>
            <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>PlaceOfSupply</NATIVEMETHOD>
            <NATIVEMETHOD>IsOptional</NATIVEMETHOD>
            <NATIVEMETHOD>IsCancelled</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
  }

  // TallyPrime 6.x compatible: Export Purchase Vouchers
  static getGSTPurchaseRegister(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    const fromDateTally = this.formatDateForTally(fromDate);
    const toDateTally = this.formatDateForTally(toDate);

    return `<ENVELOPE>
<HEADER>
<VERSION>1</VERSION>
<TALLYREQUEST>Export</TALLYREQUEST>
<TYPE>Data</TYPE>
<ID>Day Book</ID>
</HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
${companyVar}
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<EXPLODEFLAG>Yes</EXPLODEFLAG>
<SVFROMDATE>${fromDateTally}</SVFROMDATE>
<SVTODATE>${toDateTally}</SVTODATE>
</STATICVARIABLES>
</DESC>
</BODY>
</ENVELOPE>`;
  }

  static getGSTR1Summary(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>GSTR1 Export</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
            <GSTRTABLEWISETXN>B2B,B2CL,B2CS,CDNR,CDNUR,EXPT,HSN,DOC</GSTRTABLEWISETXN>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getGSTR3BSummary(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>GSTR3B Summary</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getHSNSummary(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>HSNSummary</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="HSNSummary">
                <TYPE>StockItem</TYPE>
                <FETCH>NAME, HSNCODE, GSTRATE, CLOSINGBALANCE, CLOSINGVALUE</FETCH>
                <FILTER>HasHSN</FILTER>
              </COLLECTION>
              <SYSTEM TYPE="Formulae" NAME="HasHSN">$HSNCODE != ""</SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== TDS SPECIFIC REQUESTS ====================

  static getTDSTransactions(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>TDSVoucherCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="TDSVoucherCollection">
                <TYPE>Voucher</TYPE>
                <FILTER>HasTDS</FILTER>
                <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, ALLLEDGERENTRIES.*, ALLLEDGERENTRIES.TDSNATURE, ALLLEDGERENTRIES.TDSSECTION, ALLLEDGERENTRIES.TDSRATE</FETCH>
              </COLLECTION>
              <SYSTEM TYPE="Formulae" NAME="HasTDS">$$IsTDSVoucher:$GUID</SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getTDSPayableReport(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>TDSPayableCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="TDSPayableCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Duties &amp; Taxes</CHILDOF>
                <FILTER>IsTDSLedger</FILTER>
                <FETCH>NAME, CLOSINGBALANCE, PARENT</FETCH>
              </COLLECTION>
              <SYSTEM TYPE="Formulae" NAME="IsTDSLedger">$$StringContains:$Name:"TDS"</SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== BANK RECONCILIATION REQUESTS ====================

  static getBankTransactions(bankLedgerName: string, fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>BankTransactionCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
            <SVLEDGERNAME>${bankLedgerName}</SVLEDGERNAME>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="BankTransactionCollection">
                <TYPE>Voucher</TYPE>
                <FILTER>HasBankLedger</FILTER>
                <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, NARRATION, ALLLEDGERENTRIES.*, BANKALLOCATIONS.*</FETCH>
              </COLLECTION>
              <SYSTEM TYPE="Formulae" NAME="HasBankLedger">$$FilterContains:$ALLLEDGERENTRIES[LEDGERNAME].LEDGERNAME:"${bankLedgerName}"</SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getBankReconciliation(bankLedgerName: string, asOnDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Bank Reconciliation</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVTODATE>${asOnDate}</SVTODATE>
            <SVLEDGERNAME>${bankLedgerName}</SVLEDGERNAME>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getBankLedgers(companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>BankLedgerCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="BankLedgerCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Bank Accounts</CHILDOF>
                <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, BANKACCHOLDERNAME, BANKACCOUNTNUMBER, IFSCODE</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== TAX AUDIT (SECTION 44AB) REQUESTS ====================

  static getCashTransactionsAboveLimit(fromDate: string, toDate: string, limit: number = 10000, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>CashTransactionCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="CashTransactionCollection">
                <TYPE>Voucher</TYPE>
                <FILTER>IsCashAboveLimit</FILTER>
                <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, PARTYLEDGERNAME, NARRATION, ALLLEDGERENTRIES.*</FETCH>
              </COLLECTION>
              <SYSTEM TYPE="Formulae" NAME="IsCashAboveLimit">
                ($$FilterCount:$AllLedgerEntries:$IsCashLedger &gt; 0) AND ($$Abs:$Amount &gt; ${limit})
              </SYSTEM>
              <SYSTEM TYPE="Formulae" NAME="IsCashLedger">
                $Parent = "Cash-in-Hand"
              </SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getCapitalGoodsRegister(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>FixedAssetCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="FixedAssetCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Fixed Assets</CHILDOF>
                <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getLoanAndAdvances(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LoanAdvanceCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="LoanAdvanceCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Loans and Advances (Asset), Loans (Liability)</CHILDOF>
                <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE, INCOMETAXNUMBER</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== FINANCIAL STATEMENTS REQUESTS ====================

  static getTrialBalance(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Trial Balance</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
            <EXPLOESSION>All Items</EXPLOESSION>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getBalanceSheet(asOnDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Balance Sheet</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVTODATE>${asOnDate}</SVTODATE>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getProfitAndLoss(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Profit and Loss</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getCashFlow(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Cash Flow</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getFundFlow(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Fund Flow</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== AGING ANALYSIS REQUESTS ====================

  static getReceivablesAging(asOnDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>ReceivablesAgingCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVTODATE>${asOnDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="ReceivablesAgingCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Sundry Debtors</CHILDOF>
                <FETCH>NAME, CLOSINGBALANCE, BILLALLOCATIONS.*</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getPayablesAging(asOnDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>PayablesAgingCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVTODATE>${asOnDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="PayablesAgingCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Sundry Creditors</CHILDOF>
                <FETCH>NAME, CLOSINGBALANCE, BILLALLOCATIONS.*</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== AUDIT TRAIL REQUESTS ====================

  static getAuditTrail(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>AuditTrailCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="AuditTrailCollection">
                <TYPE>Voucher</TYPE>
                <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, ALTERID, ALTEREDBY, ALTERDATE, ALTERTIME</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== COMPANIES ACT REQUESTS ====================

  static getShareCapitalDetails(companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>ShareCapitalCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="ShareCapitalCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Capital Account, Share Capital</CHILDOF>
                <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getReservesAndSurplus(companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>ReservesCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="ReservesCollection">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Reserves &amp; Surplus</CHILDOF>
                <FETCH>NAME, GUID, PARENT, OPENINGBALANCE, CLOSINGBALANCE</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  // ==================== DAYBOOK AND REGISTERS ====================

  static getDayBook(date: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Day Book</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${date}</SVFROMDATE>
            <SVTODATE>${date}</SVTODATE>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getLedgerVouchers(ledgerName: string, fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>LedgerVoucherCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="LedgerVoucherCollection">
                <TYPE>Voucher</TYPE>
                <FILTER>HasLedger</FILTER>
                <FETCH>DATE, VOUCHERNUMBER, VOUCHERTYPENAME, NARRATION, ALLLEDGERENTRIES.*</FETCH>
              </COLLECTION>
              <SYSTEM TYPE="Formulae" NAME="HasLedger">
                $$FilterContains:$AllLedgerEntries[LEDGERNAME].LEDGERNAME:"${ledgerName}"
              </SYSTEM>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  static getStockSummary(fromDate: string, toDate: string, companyName?: string): string {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';
    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Stock Summary</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${companyVar}
            <SVFROMDATE>${fromDate}</SVFROMDATE>
            <SVTODATE>${toDate}</SVTODATE>
          </STATICVARIABLES>
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }
}
