#!/usr/bin/env node

// Tally MCP Server - Main Entry Point
// Comprehensive Tally ERP integration for Indian CA compliance

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { TallyConnection, createTallyConnection } from './tally/connection.js';
import { TaxAuditTools } from './tools/tax-audit.js';
import { GSTTools } from './tools/gst.js';
import { TDSTools, TDS_RATES } from './tools/tds.js';
import { BankReconciliationTools } from './tools/bank-reconciliation.js';
import { StatutoryTools } from './tools/statutory.js';
import { FinancialTools } from './tools/financial.js';
import { ConfigAuditTools } from './tools/config-audit.js';

// Initialize Tally connection
let tallyConnection: TallyConnection;
let taxAuditTools: TaxAuditTools;
let gstTools: GSTTools;
let tdsTools: TDSTools;
let bankReconTools: BankReconciliationTools;
let statutoryTools: StatutoryTools;
let financialTools: FinancialTools;
let configAuditTools: ConfigAuditTools;

// Tool definitions
const tools: Tool[] = [
  // ==================== CONNECTION & SETUP ====================
  {
    name: 'tally_connect',
    description: 'Connect to Tally ERP. Must be called first before using other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Tally server host (default: localhost)', default: 'localhost' },
        port: { type: 'number', description: 'Tally ODBC port (default: 9000)', default: 9000 },
      },
    },
  },
  {
    name: 'tally_test_connection',
    description: 'Test if Tally is running and accessible',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tally_get_companies',
    description: 'Get list of all companies in Tally',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tally_set_company',
    description: 'Set the active company for subsequent operations',
    inputSchema: {
      type: 'object',
      properties: {
        companyName: { type: 'string', description: 'Name of the company to select' },
      },
      required: ['companyName'],
    },
  },

  // ==================== CONFIGURATION AUDIT & AUTO-FIX ====================
  {
    name: 'config_audit_full',
    description: 'Run complete Tally configuration audit. Analyzes GST, TDS, ledger classification, party masters, and stock items. Returns issues with severity and auto-fix suggestions. RUN THIS AFTER CONNECTING TO IDENTIFY CONFIGURATION PROBLEMS.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_audit_gst',
    description: 'Audit only GST configuration - checks GST ledgers, rates, HSN codes',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_audit_tds',
    description: 'Audit only TDS configuration - checks TDS ledgers, expense ledger TDS settings, party PAN',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_audit_ledgers',
    description: 'Audit ledger classification - checks for misclassified ledgers, suspense accounts, duplicates',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_audit_parties',
    description: 'Audit party masters - checks GSTIN, PAN, State for debtors and creditors',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_audit_stock',
    description: 'Audit stock items - checks HSN codes, GST rates, units of measure',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_get_fixable_issues',
    description: 'Get list of all auto-fixable configuration issues',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'config_preview_fix',
    description: 'Preview what changes will be made for a specific issue before applying',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'Issue ID from audit report (e.g., GST_OUTPUT_IGST_MISSING)' },
      },
      required: ['issueId'],
    },
  },
  {
    name: 'config_apply_fix',
    description: 'Apply auto-fix for a specific issue. Use config_preview_fix first to see what will change.',
    inputSchema: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'Issue ID to fix' },
      },
      required: ['issueId'],
    },
  },
  {
    name: 'config_apply_multiple_fixes',
    description: 'Apply multiple auto-fixes at once. Provide array of issue IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        issueIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of issue IDs to fix',
        },
      },
      required: ['issueIds'],
    },
  },

  // ==================== TAX AUDIT (SECTION 44AB) ====================
  {
    name: 'tax_audit_cash_transactions',
    description: 'Get cash transactions above specified limit for Clause 17(a) of Form 3CD',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Amount limit (default: 10000)', default: 10000 },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tax_audit_40a3_violations',
    description: 'Get Section 40A(3) violations - cash payments above Rs. 10,000',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tax_audit_tds_compliance',
    description: 'Get TDS compliance report for Clause 21(b) of Form 3CD',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tax_audit_quantitative',
    description: 'Get quantitative details of stock for Clause 26',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tax_audit_gst_summary',
    description: 'Get GST compliance summary for Clause 31',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tax_audit_loans',
    description: 'Get loans and deposits for Clause 32',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tax_audit_fixed_assets',
    description: 'Get fixed assets schedule for Clause 34(a)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tax_audit_form3cd',
    description: 'Get complete Form 3CD data for Tax Audit',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Financial year start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Financial year end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },

  // ==================== GST COMPLIANCE ====================
  {
    name: 'gst_gstr1_data',
    description: 'Get GSTR-1 data (B2B, B2CL, B2CS, CDNR, CDNUR, Exports, HSN)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'gst_gstr3b_data',
    description: 'Get GSTR-3B summary data (Output tax, Input tax, Net liability)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'gst_reconcile_2a',
    description: 'Reconcile Tally purchases with GSTR-2A data',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
        gstr2aData: {
          type: 'array',
          description: 'GSTR-2A data from GST portal (array of transactions)',
          items: { type: 'object' },
        },
      },
      required: ['fromDate', 'toDate', 'gstr2aData'],
    },
  },
  {
    name: 'gst_reconcile_1_vs_3b',
    description: 'Reconcile GSTR-1 with GSTR-3B for the period',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'gst_ledger_summary',
    description: 'Get GST ledger balances (Input/Output IGST, CGST, SGST)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'gst_itc_register',
    description: 'Get Input Tax Credit register with eligibility analysis',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'gst_eway_bills',
    description: 'Get E-Way Bill data and compliance status',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'gst_einvoices',
    description: 'Get E-Invoice data and compliance status',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'debug_raw_sales',
    description: 'DEBUG: Get raw sales data from Tally to diagnose GSTR-1 issues. Returns raw XML response.',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },

  // ==================== TDS COMPLIANCE ====================
  {
    name: 'tds_transactions',
    description: 'Get all TDS transactions for the period',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tds_summary',
    description: 'Get section-wise TDS summary',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tds_form_26q',
    description: 'Get Form 26Q data (Quarterly TDS return for non-salary)',
    inputSchema: {
      type: 'object',
      properties: {
        quarter: { type: 'string', enum: ['Q1', 'Q2', 'Q3', 'Q4'], description: 'Quarter' },
        financialYear: { type: 'string', description: 'Financial year (e.g., 2024-25)' },
      },
      required: ['quarter', 'financialYear'],
    },
  },
  {
    name: 'tds_form_24q',
    description: 'Get Form 24Q data (Quarterly TDS return for salary)',
    inputSchema: {
      type: 'object',
      properties: {
        quarter: { type: 'string', enum: ['Q1', 'Q2', 'Q3', 'Q4'], description: 'Quarter' },
        financialYear: { type: 'string', description: 'Financial year (e.g., 2024-25)' },
      },
      required: ['quarter', 'financialYear'],
    },
  },
  {
    name: 'tds_form_27q',
    description: 'Get Form 27Q data (TDS on non-resident payments)',
    inputSchema: {
      type: 'object',
      properties: {
        quarter: { type: 'string', enum: ['Q1', 'Q2', 'Q3', 'Q4'], description: 'Quarter' },
        financialYear: { type: 'string', description: 'Financial year (e.g., 2024-25)' },
      },
      required: ['quarter', 'financialYear'],
    },
  },
  {
    name: 'tds_compliance_check',
    description: 'Check TDS compliance - identify non-deductions and short deductions',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tds_payable',
    description: 'Get TDS payable ledger balances',
    inputSchema: {
      type: 'object',
      properties: {
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['asOnDate'],
    },
  },
  {
    name: 'tds_party_wise',
    description: 'Get party-wise TDS details (for Form 16/16A)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
        partyPAN: { type: 'string', description: 'Optional: Filter by party PAN' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'tds_rates',
    description: 'Get TDS rates reference for all sections',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tds_calculate',
    description: 'Calculate TDS for a given payment',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'TDS Section (e.g., 194C, 194J)' },
        amount: { type: 'number', description: 'Payment amount' },
        hasPAN: { type: 'boolean', description: 'Whether deductee has PAN', default: true },
      },
      required: ['section', 'amount'],
    },
  },

  // ==================== BANK RECONCILIATION ====================
  {
    name: 'bank_ledgers',
    description: 'Get list of all bank accounts',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'bank_book',
    description: 'Get bank book transactions',
    inputSchema: {
      type: 'object',
      properties: {
        bankLedgerName: { type: 'string', description: 'Bank ledger name' },
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['bankLedgerName', 'fromDate', 'toDate'],
    },
  },
  {
    name: 'bank_brs',
    description: 'Generate Bank Reconciliation Statement',
    inputSchema: {
      type: 'object',
      properties: {
        bankLedgerName: { type: 'string', description: 'Bank ledger name' },
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['bankLedgerName', 'asOnDate'],
    },
  },
  {
    name: 'bank_auto_reconcile',
    description: 'Auto-reconcile bank book with bank statement',
    inputSchema: {
      type: 'object',
      properties: {
        bankLedgerName: { type: 'string', description: 'Bank ledger name' },
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        bankStatement: {
          type: 'array',
          description: 'Bank statement entries',
          items: { type: 'object' },
        },
      },
      required: ['bankLedgerName', 'fromDate', 'toDate', 'bankStatement'],
    },
  },
  {
    name: 'bank_uncleared_aging',
    description: 'Get aging of uncleared cheques and deposits',
    inputSchema: {
      type: 'object',
      properties: {
        bankLedgerName: { type: 'string', description: 'Bank ledger name' },
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['bankLedgerName', 'asOnDate'],
    },
  },
  {
    name: 'bank_summary',
    description: 'Get summary of all bank accounts',
    inputSchema: {
      type: 'object',
      properties: {
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['asOnDate'],
    },
  },
  {
    name: 'bank_cheque_register',
    description: 'Get cheque register for a bank',
    inputSchema: {
      type: 'object',
      properties: {
        bankLedgerName: { type: 'string', description: 'Bank ledger name' },
        fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['bankLedgerName', 'fromDate', 'toDate'],
    },
  },
  {
    name: 'bank_pdc',
    description: 'Get post-dated cheques',
    inputSchema: {
      type: 'object',
      properties: {
        bankLedgerName: { type: 'string', description: 'Bank ledger name' },
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['bankLedgerName', 'asOnDate'],
    },
  },

  // ==================== STATUTORY REPORTS ====================
  {
    name: 'statutory_share_capital',
    description: 'Get share capital structure',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'statutory_reserves',
    description: 'Get reserves and surplus',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'statutory_borrowings',
    description: 'Get secured and unsecured borrowings',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'statutory_schedule_iii_bs',
    description: 'Get Schedule III compliant Balance Sheet',
    inputSchema: {
      type: 'object',
      properties: {
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['asOnDate'],
    },
  },
  {
    name: 'statutory_schedule_iii_pl',
    description: 'Get Schedule III compliant Profit & Loss',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'statutory_audit_trail',
    description: 'Get audit trail report (mandatory under Companies Act)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'statutory_cash_flow',
    description: 'Get Cash Flow Statement (AS-3 / Ind AS 7)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'statutory_contingent_liabilities',
    description: 'Get contingent liabilities',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'statutory_related_party',
    description: 'Get related party transactions (AS-18)',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
        relatedPartyLedgers: {
          type: 'array',
          description: 'List of related party ledger names',
          items: { type: 'string' },
        },
      },
      required: ['fromDate', 'toDate', 'relatedPartyLedgers'],
    },
  },

  // ==================== FINANCIAL ANALYSIS ====================
  {
    name: 'financial_trial_balance',
    description: 'Get Trial Balance',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'financial_profit_loss',
    description: 'Get Profit & Loss Statement',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'financial_balance_sheet',
    description: 'Get Balance Sheet',
    inputSchema: {
      type: 'object',
      properties: {
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['asOnDate'],
    },
  },
  {
    name: 'financial_ratios',
    description: 'Calculate financial ratios',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'financial_debtors_aging',
    description: 'Get debtors aging analysis',
    inputSchema: {
      type: 'object',
      properties: {
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['asOnDate'],
    },
  },
  {
    name: 'financial_creditors_aging',
    description: 'Get creditors aging analysis',
    inputSchema: {
      type: 'object',
      properties: {
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['asOnDate'],
    },
  },
  {
    name: 'financial_msme_payables',
    description: 'Get MSME payables (Section 43B(h) compliance)',
    inputSchema: {
      type: 'object',
      properties: {
        asOnDate: { type: 'string', description: 'As on date (YYYY-MM-DD)' },
      },
      required: ['asOnDate'],
    },
  },
  {
    name: 'financial_stock_summary',
    description: 'Get stock summary',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['fromDate', 'toDate'],
    },
  },
  {
    name: 'financial_day_book',
    description: 'Get day book for a specific date',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
      },
      required: ['date'],
    },
  },
  {
    name: 'financial_ledger_statement',
    description: 'Get ledger statement',
    inputSchema: {
      type: 'object',
      properties: {
        ledgerName: { type: 'string', description: 'Ledger name' },
        fromDate: { type: 'string', description: 'Period start date (YYYY-MM-DD)' },
        toDate: { type: 'string', description: 'Period end date (YYYY-MM-DD)' },
      },
      required: ['ledgerName', 'fromDate', 'toDate'],
    },
  },
  {
    name: 'financial_group_summary',
    description: 'Get group summary',
    inputSchema: {
      type: 'object',
      properties: {
        groupName: { type: 'string', description: 'Group name' },
      },
      required: ['groupName'],
    },
  },
];

// Create server
const server = new Server(
  {
    name: 'tally-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    switch (name) {
      // Connection & Setup
      case 'tally_connect':
        tallyConnection = createTallyConnection({
          host: (args as any)?.host || 'localhost',
          port: (args as any)?.port || 9000,
        });
        taxAuditTools = new TaxAuditTools(tallyConnection);
        gstTools = new GSTTools(tallyConnection);
        tdsTools = new TDSTools(tallyConnection);
        bankReconTools = new BankReconciliationTools(tallyConnection);
        statutoryTools = new StatutoryTools(tallyConnection);
        financialTools = new FinancialTools(tallyConnection);
        configAuditTools = new ConfigAuditTools(tallyConnection);
        result = {
          success: true,
          message: 'Connected to Tally. RECOMMENDED: Run config_audit_full to check your Tally configuration for GST, TDS, and ledger setup issues before proceeding with compliance reports.'
        };
        break;

      case 'tally_test_connection':
        ensureConnection();
        result = await tallyConnection.testConnection();
        break;

      case 'tally_get_companies':
        ensureConnection();
        result = await tallyConnection.getCompanyList();
        break;

      case 'tally_set_company':
        ensureConnection();
        result = await tallyConnection.setCompany((args as any).companyName);
        break;

      // Configuration Audit & Auto-Fix
      case 'config_audit_full':
        ensureConnection();
        result = await configAuditTools.runFullAudit();
        break;

      case 'config_audit_gst':
        ensureConnection();
        result = await configAuditTools.getIssuesByCategory('GST');
        break;

      case 'config_audit_tds':
        ensureConnection();
        result = await configAuditTools.getIssuesByCategory('TDS');
        break;

      case 'config_audit_ledgers':
        ensureConnection();
        result = await configAuditTools.getIssuesByCategory('Ledger Classification');
        break;

      case 'config_audit_parties':
        ensureConnection();
        result = await configAuditTools.getIssuesByCategory('Party Master');
        break;

      case 'config_audit_stock':
        ensureConnection();
        result = await configAuditTools.getIssuesByCategory('Stock Item');
        break;

      case 'config_get_fixable_issues':
        ensureConnection();
        result = await configAuditTools.getAutoFixableIssues();
        break;

      case 'config_preview_fix':
        ensureConnection();
        result = await configAuditTools.previewFix((args as any).issueId);
        break;

      case 'config_apply_fix':
        ensureConnection();
        result = await configAuditTools.applyFix((args as any).issueId);
        break;

      case 'config_apply_multiple_fixes':
        ensureConnection();
        result = await configAuditTools.applyMultipleFixes((args as any).issueIds);
        break;

      // Tax Audit
      case 'tax_audit_cash_transactions':
        ensureConnection();
        result = await taxAuditTools.getCashTransactionsAboveLimit(
          (args as any).fromDate,
          (args as any).toDate,
          (args as any).limit
        );
        break;

      case 'tax_audit_40a3_violations':
        ensureConnection();
        result = await taxAuditTools.getSection40A3Violations((args as any).fromDate, (args as any).toDate);
        break;

      case 'tax_audit_tds_compliance':
        ensureConnection();
        result = await taxAuditTools.getTDSComplianceReport((args as any).fromDate, (args as any).toDate);
        break;

      case 'tax_audit_quantitative':
        ensureConnection();
        result = await taxAuditTools.getQuantitativeDetails((args as any).fromDate, (args as any).toDate);
        break;

      case 'tax_audit_gst_summary':
        ensureConnection();
        result = await taxAuditTools.getGSTComplianceSummary((args as any).fromDate, (args as any).toDate);
        break;

      case 'tax_audit_loans':
        ensureConnection();
        result = await taxAuditTools.getLoansAndDeposits((args as any).fromDate, (args as any).toDate);
        break;

      case 'tax_audit_fixed_assets':
        ensureConnection();
        result = await taxAuditTools.getFixedAssetsSchedule((args as any).fromDate, (args as any).toDate);
        break;

      case 'tax_audit_form3cd':
        ensureConnection();
        result = await taxAuditTools.getForm3CDData((args as any).fromDate, (args as any).toDate);
        break;

      // GST
      case 'gst_gstr1_data':
        ensureConnection();
        result = await gstTools.getGSTR1Data((args as any).fromDate, (args as any).toDate);
        break;

      case 'gst_gstr3b_data':
        ensureConnection();
        result = await gstTools.getGSTR3BData((args as any).fromDate, (args as any).toDate);
        break;

      case 'gst_reconcile_2a':
        ensureConnection();
        result = await gstTools.reconcileWithGSTR2A(
          (args as any).fromDate,
          (args as any).toDate,
          (args as any).gstr2aData
        );
        break;

      case 'gst_reconcile_1_vs_3b':
        ensureConnection();
        result = await gstTools.reconcileGSTR1WithGSTR3B((args as any).fromDate, (args as any).toDate);
        break;

      case 'gst_ledger_summary':
        ensureConnection();
        result = await gstTools.getGSTLedgerSummary((args as any).fromDate, (args as any).toDate);
        break;

      case 'gst_itc_register':
        ensureConnection();
        result = await gstTools.getITCRegister((args as any).fromDate, (args as any).toDate);
        break;

      case 'gst_eway_bills':
        ensureConnection();
        result = await gstTools.getEWayBillData((args as any).fromDate, (args as any).toDate);
        break;

      case 'gst_einvoices':
        ensureConnection();
        result = await gstTools.getEInvoiceData((args as any).fromDate, (args as any).toDate);
        break;

      case 'debug_raw_sales': {
        ensureConnection();
        const { TallyRequests } = await import('./tally/requests.js');
        const fromDateFormatted = tallyConnection.formatTallyDate(new Date((args as any).fromDate));
        const toDateFormatted = tallyConnection.formatTallyDate(new Date((args as any).toDate));
        const companyName = tallyConnection.getCompanyName();

        // Convert YYYYMMDD to DD-MMM-YYYY for Tally
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const formatTallyDate = (dateStr: string) => {
          const year = dateStr.substring(0, 4);
          const month = parseInt(dateStr.substring(4, 6), 10) - 1;
          const day = dateStr.substring(6, 8);
          return `${day}-${months[month]}-${year}`;
        };
        const fromDateTally = formatTallyDate(fromDateFormatted);
        const toDateTally = formatTallyDate(toDateFormatted);

        // Test 1: List of Vouchers export (built-in Tally report)
        const listOfVouchersXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>List of Vouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        ${companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : ''}
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${fromDateTally}</SVFROMDATE>
        <SVTODATE>${toDateTally}</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
        const listOfVouchersResponse = await tallyConnection.executeRequest(listOfVouchersXml);

        // Test 2: Collection method with FETCH
        const collectionXml = TallyRequests.getVouchersCollection(fromDateFormatted, toDateFormatted, companyName);
        const collectionResponse = await tallyConnection.executeRequest(collectionXml);

        // Test 3: Day Book export
        const dayBookXml = TallyRequests.getGSTSalesRegister(fromDateFormatted, toDateFormatted, companyName);
        const dayBookResponse = await tallyConnection.executeRequest(dayBookXml);

        // Helper to get structure info
        const getStructure = (obj: any, depth = 0): any => {
          if (depth > 4 || !obj || typeof obj !== 'object') return typeof obj;
          const res: any = {};
          for (const key of Object.keys(obj).slice(0, 15)) {
            res[key] = Array.isArray(obj[key])
              ? `Array[${obj[key].length}]`
              : getStructure(obj[key], depth + 1);
          }
          return res;
        };

        // Check if VOUCHER or DSPVCHENTRY exists anywhere
        const findDataPath = (obj: any, path = ''): string | null => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj.VOUCHER) return path + '.VOUCHER';
          if (obj.TALLYMESSAGE?.VOUCHER) return path + '.TALLYMESSAGE.VOUCHER';
          if (obj.DSPVCHENTRY) return path + '.DSPVCHENTRY';
          if (obj.DSPDAYBOOK) return path + '.DSPDAYBOOK';
          for (const key of Object.keys(obj)) {
            if (key === '#text') continue;
            const found = findDataPath(obj[key], path + '.' + key);
            if (found) return found;
          }
          return null;
        };

        result = {
          success: true,
          data: {
            companyName,
            dateRange: { from: fromDateFormatted, to: toDateFormatted, tallyFormat: { from: fromDateTally, to: toDateTally } },
            listOfVouchersRequest: {
              xml: listOfVouchersXml,
              success: listOfVouchersResponse.success,
              error: listOfVouchersResponse.error,
              rawXmlPreview: listOfVouchersResponse.rawXml?.substring(0, 2000),
              structure: listOfVouchersResponse.success ? getStructure(listOfVouchersResponse.data) : null,
              dataPath: listOfVouchersResponse.success ? findDataPath(listOfVouchersResponse.data) : null,
            },
            collectionRequest: {
              xml: collectionXml,
              success: collectionResponse.success,
              error: collectionResponse.error,
              rawXmlPreview: collectionResponse.rawXml?.substring(0, 2000),
              structure: collectionResponse.success ? getStructure(collectionResponse.data) : null,
              dataPath: collectionResponse.success ? findDataPath(collectionResponse.data) : null,
            },
            dayBookRequest: {
              xml: dayBookXml,
              success: dayBookResponse.success,
              error: dayBookResponse.error,
              rawXmlPreview: dayBookResponse.rawXml?.substring(0, 2000),
              structure: dayBookResponse.success ? getStructure(dayBookResponse.data) : null,
              dataPath: dayBookResponse.success ? findDataPath(dayBookResponse.data) : null,
            },
          },
        };
        break;
      }

      // TDS
      case 'tds_transactions':
        ensureConnection();
        result = await tdsTools.getTDSTransactions((args as any).fromDate, (args as any).toDate);
        break;

      case 'tds_summary':
        ensureConnection();
        result = await tdsTools.getTDSSummary((args as any).fromDate, (args as any).toDate);
        break;

      case 'tds_form_26q':
        ensureConnection();
        result = await tdsTools.getForm26QData((args as any).quarter, (args as any).financialYear);
        break;

      case 'tds_form_24q':
        ensureConnection();
        result = await tdsTools.getForm24QData((args as any).quarter, (args as any).financialYear);
        break;

      case 'tds_form_27q':
        ensureConnection();
        result = await tdsTools.getForm27QData((args as any).quarter, (args as any).financialYear);
        break;

      case 'tds_compliance_check':
        ensureConnection();
        result = await tdsTools.checkTDSCompliance((args as any).fromDate, (args as any).toDate);
        break;

      case 'tds_payable':
        ensureConnection();
        result = await tdsTools.getTDSPayable((args as any).asOnDate);
        break;

      case 'tds_party_wise':
        ensureConnection();
        result = await tdsTools.getPartyWiseTDS(
          (args as any).fromDate,
          (args as any).toDate,
          (args as any).partyPAN
        );
        break;

      case 'tds_rates':
        result = tdsTools.getTDSRates();
        break;

      case 'tds_calculate':
        result = tdsTools.calculateTDS((args as any).section, (args as any).amount, (args as any).hasPAN);
        break;

      // Bank Reconciliation
      case 'bank_ledgers':
        ensureConnection();
        result = await bankReconTools.getBankLedgers();
        break;

      case 'bank_book':
        ensureConnection();
        result = await bankReconTools.getBankBook(
          (args as any).bankLedgerName,
          (args as any).fromDate,
          (args as any).toDate
        );
        break;

      case 'bank_brs':
        ensureConnection();
        result = await bankReconTools.generateBRS((args as any).bankLedgerName, (args as any).asOnDate);
        break;

      case 'bank_auto_reconcile':
        ensureConnection();
        result = await bankReconTools.autoReconcile(
          (args as any).bankLedgerName,
          (args as any).fromDate,
          (args as any).toDate,
          (args as any).bankStatement
        );
        break;

      case 'bank_uncleared_aging':
        ensureConnection();
        result = await bankReconTools.getUnclearedAging((args as any).bankLedgerName, (args as any).asOnDate);
        break;

      case 'bank_summary':
        ensureConnection();
        result = await bankReconTools.getAllBanksSummary((args as any).asOnDate);
        break;

      case 'bank_cheque_register':
        ensureConnection();
        result = await bankReconTools.getChequeRegister(
          (args as any).bankLedgerName,
          (args as any).fromDate,
          (args as any).toDate
        );
        break;

      case 'bank_pdc':
        ensureConnection();
        result = await bankReconTools.getPostDatedCheques((args as any).bankLedgerName, (args as any).asOnDate);
        break;

      // Statutory
      case 'statutory_share_capital':
        ensureConnection();
        result = await statutoryTools.getShareCapitalStructure();
        break;

      case 'statutory_reserves':
        ensureConnection();
        result = await statutoryTools.getReservesAndSurplus();
        break;

      case 'statutory_borrowings':
        ensureConnection();
        result = await statutoryTools.getBorrowings();
        break;

      case 'statutory_schedule_iii_bs':
        ensureConnection();
        result = await statutoryTools.getScheduleIIIBalanceSheet((args as any).asOnDate);
        break;

      case 'statutory_schedule_iii_pl':
        ensureConnection();
        result = await statutoryTools.getScheduleIIIProfitLoss((args as any).fromDate, (args as any).toDate);
        break;

      case 'statutory_audit_trail':
        ensureConnection();
        result = await statutoryTools.getAuditTrailReport((args as any).fromDate, (args as any).toDate);
        break;

      case 'statutory_cash_flow':
        ensureConnection();
        result = await statutoryTools.getCashFlowStatement((args as any).fromDate, (args as any).toDate);
        break;

      case 'statutory_contingent_liabilities':
        ensureConnection();
        result = await statutoryTools.getContingentLiabilities();
        break;

      case 'statutory_related_party':
        ensureConnection();
        result = await statutoryTools.getRelatedPartyTransactions(
          (args as any).fromDate,
          (args as any).toDate,
          (args as any).relatedPartyLedgers
        );
        break;

      // Financial
      case 'financial_trial_balance':
        ensureConnection();
        result = await financialTools.getTrialBalance((args as any).fromDate, (args as any).toDate);
        break;

      case 'financial_profit_loss':
        ensureConnection();
        result = await financialTools.getProfitAndLoss((args as any).fromDate, (args as any).toDate);
        break;

      case 'financial_balance_sheet':
        ensureConnection();
        result = await financialTools.getBalanceSheet((args as any).asOnDate);
        break;

      case 'financial_ratios':
        ensureConnection();
        result = await financialTools.calculateFinancialRatios((args as any).fromDate, (args as any).toDate);
        break;

      case 'financial_debtors_aging':
        ensureConnection();
        result = await financialTools.getDebtorsAging((args as any).asOnDate);
        break;

      case 'financial_creditors_aging':
        ensureConnection();
        result = await financialTools.getCreditorsAging((args as any).asOnDate);
        break;

      case 'financial_msme_payables':
        ensureConnection();
        result = await financialTools.getMSMEPayables((args as any).asOnDate);
        break;

      case 'financial_stock_summary':
        ensureConnection();
        result = await financialTools.getStockSummary((args as any).fromDate, (args as any).toDate);
        break;

      case 'financial_day_book':
        ensureConnection();
        result = await financialTools.getDayBook((args as any).date);
        break;

      case 'financial_ledger_statement':
        ensureConnection();
        result = await financialTools.getLedgerStatement(
          (args as any).ledgerName,
          (args as any).fromDate,
          (args as any).toDate
        );
        break;

      case 'financial_group_summary':
        ensureConnection();
        result = await financialTools.getGroupSummary((args as any).groupName);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: false, error: error.message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

function ensureConnection() {
  if (!tallyConnection) {
    throw new Error('Not connected to Tally. Please call tally_connect first.');
  }
}

// Main
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Tally MCP Server running on stdio');
}

main().catch(console.error);
