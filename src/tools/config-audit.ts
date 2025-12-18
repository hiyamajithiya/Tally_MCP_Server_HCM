// Tally Configuration Audit & Auto-Fix Tool
// Analyzes Tally setup and suggests/applies fixes for GST, TDS, and proper ledger classification

import { TallyConnection } from '../tally/connection.js';
import { TallyRequests } from '../tally/requests.js';
import { TallyResponse } from '../types/tally.js';

// Standard Group Names in Tally
const STANDARD_GROUPS = {
  // Primary Groups
  CAPITAL_ACCOUNT: 'Capital Account',
  CURRENT_ASSETS: 'Current Assets',
  CURRENT_LIABILITIES: 'Current Liabilities',
  DIRECT_EXPENSES: 'Direct Expenses',
  DIRECT_INCOMES: 'Direct Incomes',
  FIXED_ASSETS: 'Fixed Assets',
  INDIRECT_EXPENSES: 'Indirect Expenses',
  INDIRECT_INCOMES: 'Indirect Incomes',
  INVESTMENTS: 'Investments',
  LOANS_LIABILITY: 'Loans (Liability)',
  MISC_EXPENSES: 'Misc. Expenses (ASSET)',
  PURCHASE_ACCOUNTS: 'Purchase Accounts',
  SALES_ACCOUNTS: 'Sales Accounts',
  SUSPENSE_ACCOUNT: 'Suspense A/c',
  BRANCH_DIVISIONS: 'Branch / Divisions',

  // Sub Groups
  SUNDRY_DEBTORS: 'Sundry Debtors',
  SUNDRY_CREDITORS: 'Sundry Creditors',
  BANK_ACCOUNTS: 'Bank Accounts',
  CASH_IN_HAND: 'Cash-in-Hand',
  DUTIES_TAXES: 'Duties & Taxes',
  PROVISIONS: 'Provisions',
  RESERVES_SURPLUS: 'Reserves & Surplus',
  SECURED_LOANS: 'Secured Loans',
  UNSECURED_LOANS: 'Unsecured Loans',
  STOCK_IN_HAND: 'Stock-in-Hand',
  DEPOSITS_ASSET: 'Deposits (Asset)',
  LOANS_ADVANCES_ASSET: 'Loans & Advances (Asset)',
};

// GST Ledger Naming Conventions
const GST_LEDGER_PATTERNS = {
  OUTPUT_IGST: ['output igst', 'igst payable', 'igst output', 'igst on sales'],
  OUTPUT_CGST: ['output cgst', 'cgst payable', 'cgst output', 'cgst on sales'],
  OUTPUT_SGST: ['output sgst', 'sgst payable', 'sgst output', 'sgst on sales', 'utgst payable'],
  INPUT_IGST: ['input igst', 'igst receivable', 'igst input', 'igst on purchase'],
  INPUT_CGST: ['input cgst', 'cgst receivable', 'cgst input', 'cgst on purchase'],
  INPUT_SGST: ['input sgst', 'sgst receivable', 'sgst input', 'sgst on purchase', 'utgst receivable'],
  CESS: ['cess', 'gst cess'],
  RCM: ['rcm', 'reverse charge'],
};

// TDS Ledger Naming Conventions
const TDS_LEDGER_PATTERNS = {
  TDS_194C: ['tds 194c', 'tds on contractor', 'tds contractor', 'tds - contractor'],
  TDS_194J: ['tds 194j', 'tds on professional', 'tds professional', 'tds - professional', 'tds technical'],
  TDS_194H: ['tds 194h', 'tds on commission', 'tds commission', 'tds - commission', 'tds brokerage'],
  TDS_194I: ['tds 194i', 'tds on rent', 'tds rent', 'tds - rent'],
  TDS_194A: ['tds 194a', 'tds on interest', 'tds interest', 'tds - interest'],
  TDS_192: ['tds 192', 'tds on salary', 'tds salary', 'tds - salary'],
  TDS_194Q: ['tds 194q', 'tds on purchase', 'tds purchase goods'],
  TDS_GENERAL: ['tds payable', 'tds liability'],
};

// Expense Ledger Categories for TDS applicability
const TDS_APPLICABLE_EXPENSES = {
  '194C': ['contractor', 'labour', 'job work', 'works contract', 'sub-contract', 'transportation', 'freight', 'cartage', 'loading', 'unloading', 'catering', 'housekeeping', 'security'],
  '194J': ['professional', 'consultancy', 'legal', 'audit', 'accounting', 'technical', 'architect', 'interior', 'doctor', 'medical', 'engineering', 'ca fees', 'advocate'],
  '194H': ['commission', 'brokerage', 'agency'],
  '194I': ['rent', 'lease', 'hire'],
  '194A': ['interest'],
};

export interface AuditIssue {
  id: string;
  category: 'GST' | 'TDS' | 'Ledger Classification' | 'Party Master' | 'Stock Item' | 'Voucher Type' | 'Company Info';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  title: string;
  description: string;
  currentValue?: string;
  suggestedValue?: string;
  affectedItems?: string[];
  autoFixable: boolean;
  fixAction?: FixAction;
}

export interface FixAction {
  type: 'rename_ledger' | 'regroup_ledger' | 'update_gst_details' | 'update_tds_details' | 'create_ledger' | 'update_party' | 'update_stock_item' | 'update_company';
  targetName: string;
  changes: Record<string, any>;
}

export interface AuditReport {
  companyName: string;
  auditDate: string;
  overallScore: number;
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  categories: {
    gst: CategoryAudit;
    tds: CategoryAudit;
    ledgerClassification: CategoryAudit;
    partyMaster: CategoryAudit;
    stockItems: CategoryAudit;
    companyInfo: CategoryAudit;
  };
  issues: AuditIssue[];
  recommendations: string[];
}

export interface CategoryAudit {
  score: number;
  status: 'Good' | 'Needs Attention' | 'Critical';
  issueCount: number;
  summary: string;
}

export class ConfigAuditTools {
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

  // Main audit function - runs complete analysis
  async runFullAudit(): Promise<TallyResponse<AuditReport>> {
    const companyName = this.connection.getCompanyName();
    if (!companyName) {
      return { success: false, error: 'No company selected. Please select a company first.' };
    }

    try {
      const issues: AuditIssue[] = [];

      // Run all audit checks in parallel
      const [
        companyIssues,
        gstIssues,
        tdsIssues,
        ledgerIssues,
        partyIssues,
        stockIssues,
      ] = await Promise.all([
        this.auditCompanyInfo(),
        this.auditGSTConfiguration(),
        this.auditTDSConfiguration(),
        this.auditLedgerClassification(),
        this.auditPartyMasters(),
        this.auditStockItems(),
      ]);

      issues.push(...companyIssues, ...gstIssues, ...tdsIssues, ...ledgerIssues, ...partyIssues, ...stockIssues);

      // Calculate scores
      const criticalCount = issues.filter(i => i.severity === 'Critical').length;
      const highCount = issues.filter(i => i.severity === 'High').length;
      const mediumCount = issues.filter(i => i.severity === 'Medium').length;
      const lowCount = issues.filter(i => i.severity === 'Low').length;

      // Score calculation: Start with 100, deduct based on issues
      let score = 100;
      score -= criticalCount * 15;
      score -= highCount * 8;
      score -= mediumCount * 3;
      score -= lowCount * 1;
      score = Math.max(0, score);

      const report: AuditReport = {
        companyName,
        auditDate: new Date().toISOString().split('T')[0],
        overallScore: score,
        totalIssues: issues.length,
        criticalIssues: criticalCount,
        highIssues: highCount,
        mediumIssues: mediumCount,
        lowIssues: lowCount,
        categories: {
          gst: this.calculateCategoryScore(gstIssues, 'GST'),
          tds: this.calculateCategoryScore(tdsIssues, 'TDS'),
          ledgerClassification: this.calculateCategoryScore(ledgerIssues, 'Ledger Classification'),
          partyMaster: this.calculateCategoryScore(partyIssues, 'Party Master'),
          stockItems: this.calculateCategoryScore(stockIssues, 'Stock Items'),
          companyInfo: this.calculateCategoryScore(companyIssues, 'Company Info'),
        },
        issues,
        recommendations: this.generateRecommendations(issues),
      };

      return { success: true, data: report };
    } catch (error: any) {
      return { success: false, error: `Audit failed: ${error.message}` };
    }
  }

  // Audit Company Information
  private async auditCompanyInfo(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const companyResult = await this.connection.getCompanyList();

    if (!companyResult.success || !companyResult.data) return issues;

    const company = companyResult.data.find(c => c.name === this.connection.getCompanyName());
    if (!company) return issues;

    // Check GSTIN
    if (!company.gstNumber) {
      issues.push({
        id: 'COMP_001',
        category: 'Company Info',
        severity: 'Critical',
        title: 'GSTIN Not Configured',
        description: 'Company GSTIN is not set. This is required for GST compliance and e-invoicing.',
        suggestedValue: 'Configure GSTIN in Company Alter > Statutory Details',
        autoFixable: false,
      });
    } else if (!this.isValidGSTIN(company.gstNumber)) {
      issues.push({
        id: 'COMP_002',
        category: 'Company Info',
        severity: 'High',
        title: 'Invalid GSTIN Format',
        description: `GSTIN "${company.gstNumber}" does not match valid format.`,
        currentValue: company.gstNumber,
        suggestedValue: 'Valid 15-character GSTIN',
        autoFixable: false,
      });
    }

    // Check PAN
    if (!company.panNumber) {
      issues.push({
        id: 'COMP_003',
        category: 'Company Info',
        severity: 'Critical',
        title: 'PAN Not Configured',
        description: 'Company PAN is not set. This is required for TDS compliance and Income Tax.',
        suggestedValue: 'Configure PAN in Company Alter > Statutory Details',
        autoFixable: false,
      });
    } else if (!this.isValidPAN(company.panNumber)) {
      issues.push({
        id: 'COMP_004',
        category: 'Company Info',
        severity: 'High',
        title: 'Invalid PAN Format',
        description: `PAN "${company.panNumber}" does not match valid format.`,
        currentValue: company.panNumber,
        suggestedValue: 'Valid 10-character PAN',
        autoFixable: false,
      });
    }

    // Check TAN
    if (!company.tanNumber) {
      issues.push({
        id: 'COMP_005',
        category: 'Company Info',
        severity: 'High',
        title: 'TAN Not Configured',
        description: 'Company TAN is not set. This is required for TDS returns and Form 16/16A.',
        suggestedValue: 'Configure TAN in Company Alter > Statutory Details',
        autoFixable: false,
      });
    }

    // Check State
    if (!company.state) {
      issues.push({
        id: 'COMP_006',
        category: 'Company Info',
        severity: 'High',
        title: 'State Not Configured',
        description: 'Company state is not set. This is required for GST place of supply determination.',
        suggestedValue: 'Configure State in Company Alter',
        autoFixable: false,
      });
    }

    return issues;
  }

  // Audit GST Configuration
  private async auditGSTConfiguration(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const ledgerXml = TallyRequests.getLedgers(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(ledgerXml);

    if (!response.success) return issues;

    const ledgers = this.extractLedgers(response.data);
    const dutiesLedgers = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('duties') ||
      this.extractString(l.PARENT).toLowerCase().includes('taxes')
    );

    // Check for required GST ledgers
    const requiredGSTLedgers = [
      { type: 'OUTPUT_IGST', name: 'Output IGST', patterns: GST_LEDGER_PATTERNS.OUTPUT_IGST },
      { type: 'OUTPUT_CGST', name: 'Output CGST', patterns: GST_LEDGER_PATTERNS.OUTPUT_CGST },
      { type: 'OUTPUT_SGST', name: 'Output SGST', patterns: GST_LEDGER_PATTERNS.OUTPUT_SGST },
      { type: 'INPUT_IGST', name: 'Input IGST', patterns: GST_LEDGER_PATTERNS.INPUT_IGST },
      { type: 'INPUT_CGST', name: 'Input CGST', patterns: GST_LEDGER_PATTERNS.INPUT_CGST },
      { type: 'INPUT_SGST', name: 'Input SGST', patterns: GST_LEDGER_PATTERNS.INPUT_SGST },
    ];

    for (const required of requiredGSTLedgers) {
      const found = dutiesLedgers.find((l: any) =>
        required.patterns.some(p => this.extractString(l.NAME).toLowerCase().includes(p))
      );

      if (!found) {
        issues.push({
          id: `GST_${required.type}_MISSING`,
          category: 'GST',
          severity: 'Critical',
          title: `${required.name} Ledger Missing`,
          description: `No ${required.name} ledger found. This is required for proper GST accounting.`,
          suggestedValue: `Create ledger "${required.name}" under "Duties & Taxes"`,
          autoFixable: true,
          fixAction: {
            type: 'create_ledger',
            targetName: required.name,
            changes: {
              parent: 'Duties & Taxes',
              typeOfDuty: 'GST',
              gstDutyHead: required.type.includes('OUTPUT') ? 'Output' : 'Input',
            },
          },
        });
      }
    }

    // Check for improperly named GST ledgers
    for (const ledger of dutiesLedgers) {
      const name = this.extractString(ledger.NAME).toLowerCase();

      // Check for ambiguous GST ledgers
      if (name.includes('gst') && !name.includes('igst') && !name.includes('cgst') && !name.includes('sgst') && !name.includes('cess')) {
        issues.push({
          id: `GST_AMBIGUOUS_${ledger.NAME}`,
          category: 'GST',
          severity: 'High',
          title: 'Ambiguous GST Ledger Name',
          description: `Ledger "${ledger.NAME}" has ambiguous name. GST ledgers should be specific (IGST/CGST/SGST).`,
          currentValue: ledger.NAME,
          suggestedValue: 'Rename to specific GST type (e.g., "Output CGST", "Input IGST")',
          affectedItems: [ledger.NAME],
          autoFixable: false,
        });
      }

      // Check if GST ledgers are under correct group
      if ((name.includes('igst') || name.includes('cgst') || name.includes('sgst')) &&
          !this.extractString(ledger.PARENT).toLowerCase().includes('duties')) {
        issues.push({
          id: `GST_WRONG_GROUP_${ledger.NAME}`,
          category: 'GST',
          severity: 'High',
          title: 'GST Ledger Under Wrong Group',
          description: `GST ledger "${ledger.NAME}" is under "${ledger.PARENT}" instead of "Duties & Taxes".`,
          currentValue: ledger.PARENT,
          suggestedValue: 'Duties & Taxes',
          affectedItems: [ledger.NAME],
          autoFixable: true,
          fixAction: {
            type: 'regroup_ledger',
            targetName: ledger.NAME,
            changes: { parent: 'Duties & Taxes' },
          },
        });
      }
    }

    // Check sales ledgers for GST configuration
    const salesLedgers = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('sales')
    );

    for (const ledger of salesLedgers) {
      if (!ledger.GSTAPPLICABLE && !ledger.ISTAXABLE) {
        issues.push({
          id: `GST_SALES_${ledger.NAME}`,
          category: 'GST',
          severity: 'Medium',
          title: 'Sales Ledger Without GST Configuration',
          description: `Sales ledger "${ledger.NAME}" does not have GST applicability configured.`,
          currentValue: 'GST not configured',
          suggestedValue: 'Enable GST and set appropriate rate/HSN',
          affectedItems: [ledger.NAME],
          autoFixable: false,
        });
      }
    }

    // Check purchase ledgers for GST configuration
    const purchaseLedgers = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('purchase')
    );

    for (const ledger of purchaseLedgers) {
      if (!ledger.GSTAPPLICABLE && !ledger.ISTAXABLE) {
        issues.push({
          id: `GST_PURCHASE_${ledger.NAME}`,
          category: 'GST',
          severity: 'Medium',
          title: 'Purchase Ledger Without GST Configuration',
          description: `Purchase ledger "${ledger.NAME}" does not have GST applicability configured.`,
          currentValue: 'GST not configured',
          suggestedValue: 'Enable GST and set appropriate rate/HSN',
          affectedItems: [ledger.NAME],
          autoFixable: false,
        });
      }
    }

    return issues;
  }

  // Audit TDS Configuration
  private async auditTDSConfiguration(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const ledgerXml = TallyRequests.getLedgers(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(ledgerXml);

    if (!response.success) return issues;

    const ledgers = this.extractLedgers(response.data);
    const dutiesLedgers = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('duties') ||
      this.extractString(l.PARENT).toLowerCase().includes('taxes')
    );

    // Check for required TDS ledgers
    const requiredTDSSections = [
      { section: '194C', name: 'TDS on Contractor (194C)', patterns: TDS_LEDGER_PATTERNS.TDS_194C },
      { section: '194J', name: 'TDS on Professional (194J)', patterns: TDS_LEDGER_PATTERNS.TDS_194J },
      { section: '194H', name: 'TDS on Commission (194H)', patterns: TDS_LEDGER_PATTERNS.TDS_194H },
      { section: '194I', name: 'TDS on Rent (194I)', patterns: TDS_LEDGER_PATTERNS.TDS_194I },
      { section: '194A', name: 'TDS on Interest (194A)', patterns: TDS_LEDGER_PATTERNS.TDS_194A },
    ];

    for (const required of requiredTDSSections) {
      const found = dutiesLedgers.find((l: any) =>
        required.patterns.some(p => this.extractString(l.NAME).toLowerCase().includes(p))
      );

      if (!found) {
        issues.push({
          id: `TDS_${required.section}_MISSING`,
          category: 'TDS',
          severity: 'High',
          title: `${required.name} Ledger Missing`,
          description: `No TDS ledger for Section ${required.section} found. Create if you have such transactions.`,
          suggestedValue: `Create ledger "${required.name}" under "Duties & Taxes"`,
          autoFixable: true,
          fixAction: {
            type: 'create_ledger',
            targetName: required.name,
            changes: {
              parent: 'Duties & Taxes',
              typeOfDuty: 'TDS',
              tdsSection: required.section,
            },
          },
        });
      }
    }

    // Check expense ledgers for TDS applicability
    const expenseLedgers = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('expense')
    );

    for (const ledger of expenseLedgers) {
      const name = this.extractString(ledger.NAME).toLowerCase();

      // Identify which TDS section should apply
      for (const [section, keywords] of Object.entries(TDS_APPLICABLE_EXPENSES)) {
        const matchingKeyword = keywords.find(kw => name.includes(kw));
        if (matchingKeyword) {
          // Check if TDS is enabled for this ledger
          if (!ledger.ISTDSAPPLICABLE || ledger.ISTDSAPPLICABLE === 'No') {
            issues.push({
              id: `TDS_EXPENSE_${ledger.NAME}_${section}`,
              category: 'TDS',
              severity: 'High',
              title: 'TDS Not Enabled on Expense Ledger',
              description: `Expense ledger "${ledger.NAME}" contains "${matchingKeyword}" but TDS is not enabled. Section ${section} may be applicable.`,
              currentValue: 'TDS Applicable: No',
              suggestedValue: `Enable TDS with Section ${section}`,
              affectedItems: [ledger.NAME],
              autoFixable: true,
              fixAction: {
                type: 'update_tds_details',
                targetName: ledger.NAME,
                changes: {
                  isTDSApplicable: true,
                  tdsSection: section,
                },
              },
            });
          }
          break; // Found matching section, no need to check others
        }
      }
    }

    // Check party ledgers (Sundry Creditors) for TDS deductee type
    const creditorLedgers = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('sundry creditor')
    );

    const creditorsWithoutPAN: string[] = [];
    const creditorsWithoutTDSType: string[] = [];

    for (const ledger of creditorLedgers) {
      const balance = Math.abs(this.connection.parseAmount(ledger.CLOSINGBALANCE));

      // Only check ledgers with significant balance
      if (balance > 30000) {
        if (!ledger.INCOMETAXNUMBER) {
          creditorsWithoutPAN.push(ledger.NAME);
        }
        if (!ledger.TDSDEDUCTEETYPE) {
          creditorsWithoutTDSType.push(ledger.NAME);
        }
      }
    }

    if (creditorsWithoutPAN.length > 0) {
      issues.push({
        id: 'TDS_CREDITORS_NO_PAN',
        category: 'TDS',
        severity: 'High',
        title: 'Creditors Without PAN',
        description: `${creditorsWithoutPAN.length} creditors with balance > Rs. 30,000 do not have PAN. TDS at higher rate (20%) will apply.`,
        affectedItems: creditorsWithoutPAN.slice(0, 10), // Show first 10
        autoFixable: false,
      });
    }

    if (creditorsWithoutTDSType.length > 0) {
      issues.push({
        id: 'TDS_CREDITORS_NO_TYPE',
        category: 'TDS',
        severity: 'Medium',
        title: 'Creditors Without TDS Deductee Type',
        description: `${creditorsWithoutTDSType.length} creditors do not have TDS deductee type configured.`,
        affectedItems: creditorsWithoutTDSType.slice(0, 10),
        autoFixable: false,
      });
    }

    return issues;
  }

  // Audit Ledger Classification
  private async auditLedgerClassification(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const ledgerXml = TallyRequests.getLedgers(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(ledgerXml);

    if (!response.success) return issues;

    const ledgers = this.extractLedgers(response.data);

    // Check for ledgers under Suspense Account
    const suspenseLedgers = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('suspense')
    );

    if (suspenseLedgers.length > 0) {
      for (const ledger of suspenseLedgers) {
        const balance = this.connection.parseAmount(ledger.CLOSINGBALANCE);
        if (balance !== 0) {
          issues.push({
            id: `LEDGER_SUSPENSE_${ledger.NAME}`,
            category: 'Ledger Classification',
            severity: 'Critical',
            title: 'Ledger Under Suspense with Balance',
            description: `Ledger "${ledger.NAME}" is under Suspense A/c with balance Rs. ${balance.toLocaleString('en-IN')}. This needs to be cleared.`,
            currentValue: `Balance: ${balance}`,
            affectedItems: [ledger.NAME],
            autoFixable: false,
          });
        }
      }
    }

    // Check for common misclassifications
    const misclassificationRules = [
      {
        keywords: ['rent received', 'rent income'],
        shouldBeUnder: 'Indirect Incomes',
        currentlyUnder: ['direct incomes', 'sales'],
      },
      {
        keywords: ['interest received', 'interest income', 'bank interest'],
        shouldBeUnder: 'Indirect Incomes',
        currentlyUnder: ['direct incomes', 'sales'],
      },
      {
        keywords: ['discount received'],
        shouldBeUnder: 'Indirect Incomes',
        currentlyUnder: ['direct incomes', 'sales'],
      },
      {
        keywords: ['salary', 'wages', 'staff welfare'],
        shouldBeUnder: 'Indirect Expenses',
        currentlyUnder: ['direct expenses'],
      },
      {
        keywords: ['depreciation'],
        shouldBeUnder: 'Indirect Expenses',
        currentlyUnder: ['direct expenses'],
      },
      {
        keywords: ['bank charges', 'bank commission'],
        shouldBeUnder: 'Indirect Expenses',
        currentlyUnder: ['direct expenses'],
      },
      {
        keywords: ['electricity', 'power', 'telephone', 'mobile'],
        shouldBeUnder: 'Indirect Expenses',
        currentlyUnder: ['direct expenses'],
      },
      {
        keywords: ['audit fee', 'professional fee', 'legal fee'],
        shouldBeUnder: 'Indirect Expenses',
        currentlyUnder: ['direct expenses'],
      },
      {
        keywords: ['fixed deposit', 'fd', 'term deposit'],
        shouldBeUnder: 'Investments',
        currentlyUnder: ['bank accounts', 'current assets'],
      },
      {
        keywords: ['security deposit', 'earnest money', 'emd'],
        shouldBeUnder: 'Deposits (Asset)',
        currentlyUnder: ['current assets', 'loans'],
      },
    ];

    for (const ledger of ledgers) {
      const name = this.extractString(ledger.NAME).toLowerCase();
      const parent = this.extractString(ledger.PARENT).toLowerCase();

      for (const rule of misclassificationRules) {
        const matchingKeyword = rule.keywords.find(kw => name.includes(kw));
        if (matchingKeyword && rule.currentlyUnder.some(g => parent.includes(g))) {
          issues.push({
            id: `LEDGER_MISCLASS_${ledger.NAME}`,
            category: 'Ledger Classification',
            severity: 'Medium',
            title: 'Potential Misclassification',
            description: `Ledger "${ledger.NAME}" might be misclassified. Contains "${matchingKeyword}" but is under "${ledger.PARENT}".`,
            currentValue: ledger.PARENT,
            suggestedValue: rule.shouldBeUnder,
            affectedItems: [ledger.NAME],
            autoFixable: true,
            fixAction: {
              type: 'regroup_ledger',
              targetName: ledger.NAME,
              changes: { parent: rule.shouldBeUnder },
            },
          });
        }
      }
    }

    // Check for duplicate-looking ledgers
    const ledgerNames = ledgers.map((l: any) => ({
      name: l.NAME || '',
      normalized: this.extractString(l.NAME).toLowerCase().replace(/[^a-z0-9]/g, ''),
    }));

    const duplicateGroups: string[][] = [];
    const checked = new Set<string>();

    for (let i = 0; i < ledgerNames.length; i++) {
      if (checked.has(ledgerNames[i].normalized)) continue;

      const similar = ledgerNames.filter((l, j) =>
        j !== i &&
        this.isSimilarName(ledgerNames[i].normalized, l.normalized)
      );

      if (similar.length > 0) {
        duplicateGroups.push([ledgerNames[i].name, ...similar.map(s => s.name)]);
        checked.add(ledgerNames[i].normalized);
        similar.forEach(s => checked.add(s.normalized));
      }
    }

    for (const group of duplicateGroups) {
      issues.push({
        id: `LEDGER_DUPLICATE_${group[0]}`,
        category: 'Ledger Classification',
        severity: 'Medium',
        title: 'Potential Duplicate Ledgers',
        description: `These ledgers have similar names and might be duplicates: ${group.join(', ')}`,
        affectedItems: group,
        autoFixable: false,
      });
    }

    return issues;
  }

  // Audit Party Masters (Debtors & Creditors)
  private async auditPartyMasters(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const ledgerXml = TallyRequests.getLedgers(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(ledgerXml);

    if (!response.success) return issues;

    const ledgers = this.extractLedgers(response.data);

    // Check Sundry Debtors
    const debtors = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('sundry debtor')
    );

    const debtorsWithoutGSTIN: string[] = [];
    const debtorsWithoutState: string[] = [];

    for (const debtor of debtors) {
      const balance = Math.abs(this.connection.parseAmount(debtor.CLOSINGBALANCE));

      if (balance > 0) {
        if (!debtor.PARTYGSTIN && !debtor.GSTREGISTRATIONTYPE) {
          debtorsWithoutGSTIN.push(debtor.NAME);
        }
        if (!debtor.LEDGERSTATENAME) {
          debtorsWithoutState.push(debtor.NAME);
        }
      }
    }

    if (debtorsWithoutGSTIN.length > 0) {
      issues.push({
        id: 'PARTY_DEBTORS_NO_GSTIN',
        category: 'Party Master',
        severity: 'High',
        title: 'Debtors Without GSTIN/Registration Type',
        description: `${debtorsWithoutGSTIN.length} debtors with outstanding balance do not have GSTIN or GST registration type configured.`,
        affectedItems: debtorsWithoutGSTIN.slice(0, 15),
        autoFixable: false,
      });
    }

    if (debtorsWithoutState.length > 0) {
      issues.push({
        id: 'PARTY_DEBTORS_NO_STATE',
        category: 'Party Master',
        severity: 'Medium',
        title: 'Debtors Without State',
        description: `${debtorsWithoutState.length} debtors do not have state configured. This affects place of supply in GST.`,
        affectedItems: debtorsWithoutState.slice(0, 15),
        autoFixable: false,
      });
    }

    // Check Sundry Creditors
    const creditors = ledgers.filter((l: any) =>
      this.extractString(l.PARENT).toLowerCase().includes('sundry creditor')
    );

    const creditorsWithoutGSTIN: string[] = [];
    const creditorsWithInvalidGSTIN: string[] = [];

    for (const creditor of creditors) {
      const balance = Math.abs(this.connection.parseAmount(creditor.CLOSINGBALANCE));

      if (balance > 0) {
        if (!creditor.PARTYGSTIN && !creditor.GSTREGISTRATIONTYPE) {
          creditorsWithoutGSTIN.push(creditor.NAME);
        } else if (creditor.PARTYGSTIN && !this.isValidGSTIN(creditor.PARTYGSTIN)) {
          creditorsWithInvalidGSTIN.push(`${creditor.NAME} (${creditor.PARTYGSTIN})`);
        }
      }
    }

    if (creditorsWithoutGSTIN.length > 0) {
      issues.push({
        id: 'PARTY_CREDITORS_NO_GSTIN',
        category: 'Party Master',
        severity: 'High',
        title: 'Creditors Without GSTIN/Registration Type',
        description: `${creditorsWithoutGSTIN.length} creditors with outstanding balance do not have GSTIN configured. ITC may be affected.`,
        affectedItems: creditorsWithoutGSTIN.slice(0, 15),
        autoFixable: false,
      });
    }

    if (creditorsWithInvalidGSTIN.length > 0) {
      issues.push({
        id: 'PARTY_CREDITORS_INVALID_GSTIN',
        category: 'Party Master',
        severity: 'Critical',
        title: 'Creditors With Invalid GSTIN',
        description: `${creditorsWithInvalidGSTIN.length} creditors have invalid GSTIN format. ITC will be rejected in reconciliation.`,
        affectedItems: creditorsWithInvalidGSTIN.slice(0, 15),
        autoFixable: false,
      });
    }

    return issues;
  }

  // Audit Stock Items
  private async auditStockItems(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const stockXml = TallyRequests.getStockItems(this.connection.getCompanyName());
    const response = await this.connection.executeRequest(stockXml);

    if (!response.success) return issues;

    const stockItems = this.extractStockItems(response.data);

    const itemsWithoutHSN: string[] = [];
    const itemsWithoutGSTRate: string[] = [];
    const itemsWithoutUnit: string[] = [];

    for (const item of stockItems) {
      if (!item.HSNCODE) {
        itemsWithoutHSN.push(item.NAME);
      }
      if (!item.GSTRATE && item.GSTRATE !== 0) {
        itemsWithoutGSTRate.push(item.NAME);
      }
      if (!item.BASEUNITS) {
        itemsWithoutUnit.push(item.NAME);
      }
    }

    if (itemsWithoutHSN.length > 0) {
      issues.push({
        id: 'STOCK_NO_HSN',
        category: 'Stock Item',
        severity: 'High',
        title: 'Stock Items Without HSN Code',
        description: `${itemsWithoutHSN.length} stock items do not have HSN code. This is mandatory for GST invoices and returns.`,
        affectedItems: itemsWithoutHSN.slice(0, 20),
        autoFixable: false,
      });
    }

    if (itemsWithoutGSTRate.length > 0) {
      issues.push({
        id: 'STOCK_NO_GST_RATE',
        category: 'Stock Item',
        severity: 'High',
        title: 'Stock Items Without GST Rate',
        description: `${itemsWithoutGSTRate.length} stock items do not have GST rate configured.`,
        affectedItems: itemsWithoutGSTRate.slice(0, 20),
        autoFixable: false,
      });
    }

    if (itemsWithoutUnit.length > 0) {
      issues.push({
        id: 'STOCK_NO_UNIT',
        category: 'Stock Item',
        severity: 'Medium',
        title: 'Stock Items Without Unit of Measure',
        description: `${itemsWithoutUnit.length} stock items do not have unit of measure. This affects HSN summary in GSTR-1.`,
        affectedItems: itemsWithoutUnit.slice(0, 20),
        autoFixable: false,
      });
    }

    return issues;
  }

  // Get issues by category
  async getIssuesByCategory(category: string): Promise<TallyResponse<AuditIssue[]>> {
    const auditResult = await this.runFullAudit();
    if (!auditResult.success) {
      return { success: false, error: auditResult.error };
    }

    const filteredIssues = auditResult.data!.issues.filter(
      i => i.category.toLowerCase() === category.toLowerCase()
    );

    return { success: true, data: filteredIssues };
  }

  // Get auto-fixable issues
  async getAutoFixableIssues(): Promise<TallyResponse<AuditIssue[]>> {
    const auditResult = await this.runFullAudit();
    if (!auditResult.success) {
      return { success: false, error: auditResult.error };
    }

    const fixableIssues = auditResult.data!.issues.filter(i => i.autoFixable);
    return { success: true, data: fixableIssues };
  }

  // Apply a specific fix
  async applyFix(issueId: string): Promise<TallyResponse<any>> {
    const auditResult = await this.runFullAudit();
    if (!auditResult.success) return auditResult;

    const issue = auditResult.data!.issues.find(i => i.id === issueId);
    if (!issue) {
      return { success: false, error: `Issue with ID "${issueId}" not found` };
    }

    if (!issue.autoFixable || !issue.fixAction) {
      return { success: false, error: `Issue "${issueId}" is not auto-fixable` };
    }

    try {
      const result = await this.executeFixAction(issue.fixAction);
      return {
        success: true,
        data: {
          issueId,
          fixAction: issue.fixAction,
          result,
          message: `Successfully applied fix for: ${issue.title}`,
        },
      };
    } catch (error: any) {
      return { success: false, error: `Failed to apply fix: ${error.message}` };
    }
  }

  // Apply multiple fixes
  async applyMultipleFixes(issueIds: string[]): Promise<TallyResponse<any>> {
    const results: any[] = [];
    const errors: any[] = [];

    for (const issueId of issueIds) {
      const result = await this.applyFix(issueId);
      if (result.success) {
        results.push(result.data);
      } else {
        errors.push({ issueId, error: result.error });
      }
    }

    return {
      success: errors.length === 0,
      data: {
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
      },
    };
  }

  // Generate fix preview (shows what would be changed without applying)
  async previewFix(issueId: string): Promise<TallyResponse<any>> {
    const auditResult = await this.runFullAudit();
    if (!auditResult.success) return auditResult;

    const issue = auditResult.data!.issues.find(i => i.id === issueId);
    if (!issue) {
      return { success: false, error: `Issue with ID "${issueId}" not found` };
    }

    if (!issue.autoFixable || !issue.fixAction) {
      return { success: false, error: `Issue "${issueId}" is not auto-fixable` };
    }

    return {
      success: true,
      data: {
        issue,
        preview: {
          action: issue.fixAction.type,
          target: issue.fixAction.targetName,
          changes: issue.fixAction.changes,
          warning: 'This is a preview. No changes have been made yet.',
        },
      },
    };
  }

  // Execute fix action (internal)
  private async executeFixAction(action: FixAction): Promise<any> {
    const companyName = this.connection.getCompanyName();

    switch (action.type) {
      case 'create_ledger':
        return this.createLedger(action.targetName, action.changes, companyName);

      case 'regroup_ledger':
        return this.regroupLedger(action.targetName, action.changes.parent, companyName);

      case 'rename_ledger':
        return this.renameLedger(action.targetName, action.changes.newName, companyName);

      case 'update_gst_details':
        return this.updateLedgerGST(action.targetName, action.changes, companyName);

      case 'update_tds_details':
        return this.updateLedgerTDS(action.targetName, action.changes, companyName);

      default:
        throw new Error(`Unknown fix action type: ${action.type}`);
    }
  }

  // Create ledger in Tally
  private async createLedger(name: string, details: any, companyName?: string): Promise<any> {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>All Masters</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            ${companyVar}
          </STATICVARIABLES>
        </DESC>
        <DATA>
          <TALLYMESSAGE>
            <LEDGER NAME="${name}" ACTION="Create">
              <NAME>${name}</NAME>
              <PARENT>${details.parent || 'Sundry Creditors'}</PARENT>
              ${details.typeOfDuty ? `<TYPEOFDUTY>${details.typeOfDuty}</TYPEOFDUTY>` : ''}
            </LEDGER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    return this.connection.executeRequest(xml);
  }

  // Regroup ledger
  private async regroupLedger(ledgerName: string, newParent: string, companyName?: string): Promise<any> {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>All Masters</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            ${companyVar}
          </STATICVARIABLES>
        </DESC>
        <DATA>
          <TALLYMESSAGE>
            <LEDGER NAME="${ledgerName}" ACTION="Alter">
              <NAME>${ledgerName}</NAME>
              <PARENT>${newParent}</PARENT>
            </LEDGER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    return this.connection.executeRequest(xml);
  }

  // Rename ledger
  private async renameLedger(oldName: string, newName: string, companyName?: string): Promise<any> {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>All Masters</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            ${companyVar}
          </STATICVARIABLES>
        </DESC>
        <DATA>
          <TALLYMESSAGE>
            <LEDGER NAME="${oldName}" ACTION="Alter">
              <NAME>${newName}</NAME>
              <OLDNAME>${oldName}</OLDNAME>
            </LEDGER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    return this.connection.executeRequest(xml);
  }

  // Update ledger GST details
  private async updateLedgerGST(ledgerName: string, gstDetails: any, companyName?: string): Promise<any> {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>All Masters</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            ${companyVar}
          </STATICVARIABLES>
        </DESC>
        <DATA>
          <TALLYMESSAGE>
            <LEDGER NAME="${ledgerName}" ACTION="Alter">
              <NAME>${ledgerName}</NAME>
              <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>
              ${gstDetails.gstRate ? `<GSTRATE>${gstDetails.gstRate}</GSTRATE>` : ''}
            </LEDGER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    return this.connection.executeRequest(xml);
  }

  // Update ledger TDS details
  private async updateLedgerTDS(ledgerName: string, tdsDetails: any, companyName?: string): Promise<any> {
    const companyVar = companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Import</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>All Masters</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            ${companyVar}
          </STATICVARIABLES>
        </DESC>
        <DATA>
          <TALLYMESSAGE>
            <LEDGER NAME="${ledgerName}" ACTION="Alter">
              <NAME>${ledgerName}</NAME>
              <ISTDSAPPLICABLE>Yes</ISTDSAPPLICABLE>
              ${tdsDetails.tdsSection ? `<TDSNATURE>${tdsDetails.tdsSection}</TDSNATURE>` : ''}
            </LEDGER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>`;

    return this.connection.executeRequest(xml);
  }

  // Helper methods
  private calculateCategoryScore(issues: AuditIssue[], categoryName: string): CategoryAudit {
    const critical = issues.filter(i => i.severity === 'Critical').length;
    const high = issues.filter(i => i.severity === 'High').length;
    const medium = issues.filter(i => i.severity === 'Medium').length;
    const low = issues.filter(i => i.severity === 'Low').length;

    let score = 100 - (critical * 20) - (high * 10) - (medium * 5) - (low * 2);
    score = Math.max(0, score);

    let status: 'Good' | 'Needs Attention' | 'Critical';
    if (score >= 80) status = 'Good';
    else if (score >= 50) status = 'Needs Attention';
    else status = 'Critical';

    let summary = '';
    if (issues.length === 0) {
      summary = `${categoryName} configuration looks good!`;
    } else {
      summary = `Found ${issues.length} issue(s): ${critical} critical, ${high} high, ${medium} medium, ${low} low`;
    }

    return { score, status, issueCount: issues.length, summary };
  }

  private generateRecommendations(issues: AuditIssue[]): string[] {
    const recommendations: string[] = [];

    // Critical issues
    const criticalIssues = issues.filter(i => i.severity === 'Critical');
    if (criticalIssues.length > 0) {
      recommendations.push(`⚠️ Address ${criticalIssues.length} CRITICAL issues immediately before proceeding with compliance work.`);
    }

    // GST specific
    const gstIssues = issues.filter(i => i.category === 'GST');
    if (gstIssues.length > 0) {
      recommendations.push('📋 Review and configure all GST ledgers with proper tax type (IGST/CGST/SGST) under Duties & Taxes group.');
    }

    // TDS specific
    const tdsIssues = issues.filter(i => i.category === 'TDS');
    if (tdsIssues.length > 0) {
      recommendations.push('📋 Enable TDS on expense ledgers where applicable and create section-wise TDS payable ledgers.');
    }

    // Party specific
    const partyIssues = issues.filter(i => i.category === 'Party Master');
    if (partyIssues.length > 0) {
      recommendations.push('📋 Update party masters with GSTIN, PAN, and State information for accurate compliance reporting.');
    }

    // Stock specific
    const stockIssues = issues.filter(i => i.category === 'Stock Item');
    if (stockIssues.length > 0) {
      recommendations.push('📋 Configure HSN codes and GST rates for all stock items for GSTR-1 HSN summary.');
    }

    // Auto-fixable
    const autoFixable = issues.filter(i => i.autoFixable);
    if (autoFixable.length > 0) {
      recommendations.push(`🔧 ${autoFixable.length} issues can be auto-fixed. Use the fix tools to apply corrections.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Great! Your Tally configuration looks good for compliance reporting.');
    }

    return recommendations;
  }

  private isValidGSTIN(gstin: string): boolean {
    if (!gstin || gstin.length !== 15) return false;
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin.toUpperCase());
  }

  private isValidPAN(pan: string): boolean {
    if (!pan || pan.length !== 10) return false;
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan.toUpperCase());
  }

  private isSimilarName(name1: string, name2: string): boolean {
    if (name1 === name2) return false;

    // Check if one contains the other
    if (name1.includes(name2) || name2.includes(name1)) {
      return name1.length > 3 && name2.length > 3;
    }

    // Levenshtein distance check for similar names
    const distance = this.levenshteinDistance(name1, name2);
    const maxLen = Math.max(name1.length, name2.length);
    const similarity = 1 - distance / maxLen;

    return similarity > 0.8 && maxLen > 5;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
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
