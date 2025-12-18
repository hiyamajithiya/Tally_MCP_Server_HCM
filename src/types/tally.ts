// Tally Data Types for Indian Compliance

export interface TallyConfig {
  host: string;
  port: number;
  companyName?: string;
}

export interface TallyCompany {
  name: string;
  guid: string;
  startingFrom: string;
  endingAt: string;
  financialYearFrom: string;
  booksFrom: string;
  gstNumber?: string;
  panNumber?: string;
  tanNumber?: string;
  address?: string;
  state?: string;
  pincode?: string;
}

export interface Ledger {
  name: string;
  guid: string;
  parent: string;
  openingBalance: number;
  closingBalance: number;
  gstRegistrationType?: string;
  gstNumber?: string;
  panNumber?: string;
  tanNumber?: string;
  address?: string;
  state?: string;
  pincode?: string;
  partyType?: 'Customer' | 'Supplier' | 'Both';
  isTDSApplicable?: boolean;
  tdsDeducteeType?: string;
}

export interface StockItem {
  name: string;
  guid: string;
  parent: string;
  openingBalance: number;
  openingValue: number;
  closingBalance: number;
  closingValue: number;
  hsnCode?: string;
  gstRate?: number;
  unit?: string;
}

export interface Voucher {
  guid: string;
  voucherNumber: string;
  voucherType: string;
  date: string;
  partyName?: string;
  amount: number;
  narration?: string;
  ledgerEntries: LedgerEntry[];
  inventoryEntries?: InventoryEntry[];
  billAllocations?: BillAllocation[];
  // GST specific
  gstNumber?: string;
  placeOfSupply?: string;
  isReverseCharge?: boolean;
  eWayBillNumber?: string;
  eInvoiceNumber?: string;
  // TDS specific
  tdsNature?: string;
  tdsSection?: string;
  tdsAmount?: number;
  tdsRate?: number;
}

export interface LedgerEntry {
  ledgerName: string;
  amount: number;
  isDeemedPositive: boolean;
  gstCategory?: string;
  gstRate?: number;
  gstAmount?: number;
}

export interface InventoryEntry {
  stockItemName: string;
  quantity: number;
  rate: number;
  amount: number;
  hsnCode?: string;
  gstRate?: number;
}

export interface BillAllocation {
  name: string;
  billType: string;
  amount: number;
}

// Tax Audit (Section 44AB) Types
export interface TaxAuditData {
  clause: string;
  description: string;
  data: any;
  remarks?: string;
}

export interface CashTransaction {
  date: string;
  voucherNumber: string;
  partyName: string;
  amount: number;
  narration?: string;
  isReceipt: boolean;
}

// GST Types
export interface GSTTransaction {
  voucherDate: string;
  voucherNumber: string;
  voucherType: string;
  partyName: string;
  partyGSTIN: string;
  placeOfSupply: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  totalTax: number;
  invoiceValue: number;
  hsnCode?: string;
  isReverseCharge: boolean;
  isAmended: boolean;
  originalInvoiceNumber?: string;
  eInvoiceNumber?: string;
  irnDate?: string;
}

export interface GSTR1Summary {
  b2b: GSTTransaction[];
  b2cl: GSTTransaction[];
  b2cs: GSTTransaction[];
  cdnr: GSTTransaction[];
  cdnur: GSTTransaction[];
  exports: GSTTransaction[];
  hsn: HSNSummary[];
  documents: DocumentSummary[];
}

export interface GSTR2ASummary {
  b2b: GSTTransaction[];
  b2bur: GSTTransaction[];
  cdnr: GSTTransaction[];
  isd: GSTTransaction[];
  impg: GSTTransaction[];
  imps: GSTTransaction[];
}

export interface GSTReconciliation {
  matched: GSTTransaction[];
  inTallyNotInReturn: GSTTransaction[];
  inReturnNotInTally: GSTTransaction[];
  amountMismatch: GSTMismatch[];
  gstinMismatch: GSTMismatch[];
}

export interface GSTMismatch {
  tallyTransaction: GSTTransaction;
  returnTransaction: GSTTransaction;
  mismatchType: string;
  tallyValue: string | number;
  returnValue: string | number;
}

export interface HSNSummary {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQuantity: number;
  totalValue: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

export interface DocumentSummary {
  documentType: string;
  fromNumber: string;
  toNumber: string;
  totalNumber: number;
  cancelled: number;
}

// TDS Types
export interface TDSTransaction {
  date: string;
  voucherNumber: string;
  deducteeName: string;
  deducteePAN: string;
  section: string;
  nature: string;
  paymentAmount: number;
  tdsRate: number;
  tdsAmount: number;
  surcharge: number;
  educationCess: number;
  totalTDS: number;
  isChallanDeposited: boolean;
  challanNumber?: string;
  challanDate?: string;
  bsrCode?: string;
}

export interface TDSSummary {
  section: string;
  nature: string;
  totalPayments: number;
  totalTDSDeducted: number;
  totalTDSDeposited: number;
  pendingTDS: number;
  transactions: TDSTransaction[];
}

export interface Form26QData {
  quarter: string;
  financialYear: string;
  deductorTAN: string;
  deductorPAN: string;
  deductorName: string;
  transactions: TDSTransaction[];
  challanDetails: ChallanDetail[];
}

export interface ChallanDetail {
  challanNumber: string;
  depositDate: string;
  bsrCode: string;
  amount: number;
  section: string;
}

// Bank Reconciliation Types
export interface BankTransaction {
  date: string;
  voucherNumber: string;
  chequeNumber?: string;
  instrumentDate?: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
  isReconciled: boolean;
  bankDate?: string;
  status: 'Cleared' | 'Uncleared' | 'Reconciled';
}

export interface BankReconciliationStatement {
  bankName: string;
  accountNumber?: string;
  asOnDate: string;
  balanceAsPerBooks: number;
  balanceAsPerBank: number;
  unClearedCheques: BankTransaction[];
  unClearedDeposits: BankTransaction[];
  reconciliationDifference: number;
}

// Companies Act Types
export interface DirectorDetails {
  din: string;
  name: string;
  designation: string;
  dateOfAppointment: string;
  dateOfCessation?: string;
  address: string;
  email?: string;
  shareholding?: number;
}

export interface ShareholderDetails {
  name: string;
  folioNumber: string;
  numberOfShares: number;
  shareClass: string;
  faceValue: number;
  paidUpValue: number;
  percentageHolding: number;
  category: string;
}

export interface RelatedPartyTransaction {
  partyName: string;
  relationship: string;
  transactionType: string;
  amount: number;
  date: string;
  boardApprovalDate?: string;
  shareholderApprovalDate?: string;
}

// Financial Analysis Types
export interface TrialBalance {
  ledgerName: string;
  group: string;
  openingDebit: number;
  openingCredit: number;
  transactionDebit: number;
  transactionCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface ProfitAndLoss {
  particulars: string;
  currentYear: number;
  previousYear?: number;
  scheduleRef?: string;
}

export interface BalanceSheet {
  particulars: string;
  currentYear: number;
  previousYear?: number;
  scheduleRef?: string;
}

export interface CashFlow {
  particulars: string;
  amount: number;
  category: 'Operating' | 'Investing' | 'Financing';
}

export interface FinancialRatios {
  currentRatio: number;
  quickRatio: number;
  debtEquityRatio: number;
  returnOnEquity: number;
  returnOnAssets: number;
  netProfitMargin: number;
  grossProfitMargin: number;
  operatingProfitMargin: number;
  inventoryTurnover: number;
  debtorsTurnover: number;
  creditorsTurnover: number;
  workingCapitalTurnover: number;
  assetTurnover: number;
  interestCoverageRatio: number;
}

// Audit Trail Types
export interface AuditTrailEntry {
  date: string;
  time: string;
  voucherType: string;
  voucherNumber: string;
  alteredBy: string;
  alterationType: 'Created' | 'Modified' | 'Deleted';
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
}

// Aged Analysis Types
export interface AgedReceivable {
  partyName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days180: number;
  above180: number;
  total: number;
  billWiseDetails?: BillDetail[];
}

export interface AgedPayable {
  partyName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days180: number;
  above180: number;
  total: number;
  billWiseDetails?: BillDetail[];
}

export interface BillDetail {
  billNumber: string;
  billDate: string;
  dueDate: string;
  amount: number;
  pending: number;
  agingDays: number;
}

// Response wrapper
export interface TallyResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawXml?: string;
}
