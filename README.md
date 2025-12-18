# Tally MCP Server

A comprehensive Model Context Protocol (MCP) Server for Tally ERP integration, designed specifically for **Chartered Accountants in India**. This server enables Claude Desktop to connect with Tally and extract data for various compliance requirements.

## Features

### Configuration Audit & Auto-Fix (NEW!)
- **Full Configuration Audit** - Complete analysis of Tally setup for compliance readiness
- **GST Configuration Check** - Validates GST ledgers, rates, HSN codes
- **TDS Configuration Check** - Validates TDS ledgers, expense ledger settings, party PAN
- **Ledger Classification Audit** - Identifies misclassified ledgers, suspense accounts, duplicates
- **Party Master Audit** - Checks GSTIN, PAN, State for all parties
- **Stock Item Audit** - Validates HSN codes, GST rates, units
- **Auto-Fix Capability** - Automatically fix common configuration issues
- **Issue Preview** - Preview changes before applying fixes

### Tax Audit (Section 44AB)
- **Form 3CD Data Extraction** - Complete clause-wise data
- **Clause 17(a)** - Cash transactions above specified limits
- **Clause 20(b)** - Section 40A(3) violations (cash payments > Rs. 10,000)
- **Clause 21(b)** - TDS compliance report
- **Clause 26** - Quantitative details of stock
- **Clause 31** - GST compliance summary
- **Clause 32** - Loans and deposits
- **Clause 34(a)** - Fixed assets schedule

### GST Compliance
- **GSTR-1 Data** - B2B, B2CL, B2CS, CDNR, CDNUR, Exports, HSN Summary
- **GSTR-3B Data** - Output tax, Input tax, Net liability calculation
- **GSTR-2A/2B Reconciliation** - Match Tally purchases with portal data
- **GSTR-1 vs GSTR-3B Reconciliation** - Cross-verify returns
- **ITC Register** - Input Tax Credit eligibility analysis
- **E-Way Bill Tracking** - Compliance status
- **E-Invoice Tracking** - IRN generation status
- **GST Ledger Summary** - IGST, CGST, SGST balances

### TDS Compliance
- **Section-wise TDS Summary** - All TDS sections
- **Form 26Q Data** - Non-salary TDS quarterly return
- **Form 24Q Data** - Salary TDS quarterly return
- **Form 27Q Data** - Non-resident TDS quarterly return
- **TDS Compliance Check** - Identify non-deductions, short deductions
- **TDS Calculator** - Calculate TDS for any payment
- **Party-wise TDS** - For Form 16/16A preparation
- **TDS Rates Reference** - Complete rate master

### Bank Reconciliation
- **Bank Reconciliation Statement (BRS)** - As per standard format
- **Auto-Reconciliation** - Match bank book with bank statement
- **Uncleared Cheque Aging** - Identify stale cheques
- **Post-Dated Cheques** - PDC tracking
- **Cheque Register** - Complete cheque history
- **Multi-Bank Summary** - All banks at a glance

### Companies Act Compliance
- **Schedule III Balance Sheet** - As per Companies Act 2013
- **Schedule III P&L** - Statement of Profit and Loss
- **Share Capital Structure** - Authorized, Issued, Paid-up
- **Reserves & Surplus** - Capital reserve, General reserve, etc.
- **Audit Trail** - Mandatory under Companies Act
- **Cash Flow Statement** - AS-3 / Ind AS 7 format
- **Related Party Transactions** - AS-18 compliance
- **Contingent Liabilities** - Disclosure requirements

### Financial Analysis
- **Trial Balance** - Opening, Transaction, Closing
- **Profit & Loss Statement** - Detailed breakdown
- **Balance Sheet** - Assets and Liabilities
- **Financial Ratios** - Liquidity, Profitability, Efficiency
- **Debtors Aging** - Age-wise receivables analysis
- **Creditors Aging** - Age-wise payables analysis
- **MSME Payables** - Section 43B(h) compliance
- **Stock Summary** - Opening, Closing, Movement
- **Ledger Statements** - Party-wise transactions
- **Day Book** - Date-wise transactions

## Prerequisites

1. **Tally ERP 9 / TallyPrime** installed and running
2. **ODBC Server** enabled in Tally (default port: 9000)
3. **Node.js** v18 or higher
4. **Claude Desktop** installed

## Installation

```bash
# Clone or download the repository
cd "Tally MCP Server"

# Install dependencies
npm install

# Build the project
npm run build
```

## Tally Configuration

Enable ODBC Server in Tally:

1. Open Tally ERP 9 / TallyPrime
2. Go to **F12 (Configure)** > **Advanced Configuration**
3. Set **Enable ODBC Server** to **Yes**
4. Set **Port** (default: 9000)
5. Press **Ctrl + A** to save

## Claude Desktop Configuration

Add to your Claude Desktop config file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "tally": {
      "command": "node",
      "args": ["d:/ADMIN/Documents/HMC AI/Tally MCP Server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after updating the configuration.

## Usage

### Connect to Tally

First, establish connection:

```
Connect to Tally on localhost port 9000
```

### Select Company

```
Get list of companies in Tally and select "My Company Pvt Ltd"
```

### Run Configuration Audit (RECOMMENDED FIRST STEP!)

After connecting and selecting a company, run the configuration audit to identify setup issues:

```
Run a full configuration audit on my Tally data

Check if my GST configuration is correct

Audit TDS settings and identify missing TDS ledgers

Show me all auto-fixable configuration issues

Preview the fix for issue GST_OUTPUT_IGST_MISSING

Apply the fix for missing Output IGST ledger

Fix all auto-fixable GST issues
```

The audit will identify:
- Missing GST ledgers (Input/Output IGST, CGST, SGST)
- TDS not enabled on expense ledgers (Professional fees, Contractor, etc.)
- Creditors without PAN (20% TDS applicable)
- Parties without GSTIN (ITC issues)
- Stock items without HSN codes
- Misclassified ledgers
- Duplicate ledgers

### Tax Audit Examples

```
Get Form 3CD data for FY 2023-24 (01-04-2023 to 31-03-2024)

Show all cash transactions above Rs. 2 lakh for tax audit

Check Section 40A(3) violations for FY 2023-24
```

### GST Examples

```
Get GSTR-1 data for January 2024

Generate GSTR-3B summary for Q3 FY 2023-24

Show GST ledger balances

Check E-Invoice compliance for current month
```

### TDS Examples

```
Get Form 26Q data for Q3 FY 2023-24

Check TDS compliance - identify non-deductions

Calculate TDS on professional fees of Rs. 50,000 under Section 194J

Show party-wise TDS for Form 16A
```

### Bank Reconciliation Examples

```
Generate BRS for HDFC Bank as on 31-12-2023

Show uncleared cheques with aging

List post-dated cheques
```

### Financial Reports

```
Get Trial Balance for FY 2023-24

Generate Balance Sheet as on 31-03-2024

Calculate financial ratios

Show debtors aging analysis

Get MSME payables for Section 43B(h) compliance
```

## Available Tools

### Connection & Setup
| Tool | Description |
|------|-------------|
| `tally_connect` | Connect to Tally server |
| `tally_test_connection` | Test connection status |
| `tally_get_companies` | List all companies |
| `tally_set_company` | Set active company |

### Configuration Audit & Auto-Fix (10 tools)
| Tool | Description |
|------|-------------|
| `config_audit_full` | Complete configuration audit with score |
| `config_audit_gst` | GST configuration audit only |
| `config_audit_tds` | TDS configuration audit only |
| `config_audit_ledgers` | Ledger classification audit |
| `config_audit_parties` | Party master audit (GSTIN, PAN) |
| `config_audit_stock` | Stock items audit (HSN, GST rates) |
| `config_get_fixable_issues` | List all auto-fixable issues |
| `config_preview_fix` | Preview fix before applying |
| `config_apply_fix` | Apply single auto-fix |
| `config_apply_multiple_fixes` | Apply multiple fixes at once |

### Tax Audit (8 tools)
| Tool | Description |
|------|-------------|
| `tax_audit_cash_transactions` | Cash transactions above limit |
| `tax_audit_40a3_violations` | Section 40A(3) violations |
| `tax_audit_tds_compliance` | TDS compliance for Clause 21(b) |
| `tax_audit_quantitative` | Stock quantitative details |
| `tax_audit_gst_summary` | GST summary for Clause 31 |
| `tax_audit_loans` | Loans and deposits |
| `tax_audit_fixed_assets` | Fixed assets schedule |
| `tax_audit_form3cd` | Complete Form 3CD data |

### GST (9 tools)
| Tool | Description |
|------|-------------|
| `gst_gstr1_data` | GSTR-1 data extraction |
| `gst_gstr3b_data` | GSTR-3B summary |
| `gst_reconcile_2a` | Reconcile with GSTR-2A |
| `gst_reconcile_1_vs_3b` | GSTR-1 vs GSTR-3B |
| `gst_ledger_summary` | GST ledger balances |
| `gst_itc_register` | ITC register |
| `gst_eway_bills` | E-Way bill data |
| `gst_einvoices` | E-Invoice data |

### TDS (10 tools)
| Tool | Description |
|------|-------------|
| `tds_transactions` | All TDS transactions |
| `tds_summary` | Section-wise summary |
| `tds_form_26q` | Form 26Q data |
| `tds_form_24q` | Form 24Q data |
| `tds_form_27q` | Form 27Q data |
| `tds_compliance_check` | Compliance verification |
| `tds_payable` | TDS payable balances |
| `tds_party_wise` | Party-wise TDS |
| `tds_rates` | TDS rates reference |
| `tds_calculate` | TDS calculator |

### Bank Reconciliation (8 tools)
| Tool | Description |
|------|-------------|
| `bank_ledgers` | List bank accounts |
| `bank_book` | Bank book transactions |
| `bank_brs` | Bank Reconciliation Statement |
| `bank_auto_reconcile` | Auto-reconciliation |
| `bank_uncleared_aging` | Uncleared items aging |
| `bank_summary` | All banks summary |
| `bank_cheque_register` | Cheque register |
| `bank_pdc` | Post-dated cheques |

### Statutory (10 tools)
| Tool | Description |
|------|-------------|
| `statutory_share_capital` | Share capital structure |
| `statutory_reserves` | Reserves and surplus |
| `statutory_borrowings` | Secured/unsecured loans |
| `statutory_schedule_iii_bs` | Schedule III Balance Sheet |
| `statutory_schedule_iii_pl` | Schedule III P&L |
| `statutory_audit_trail` | Audit trail report |
| `statutory_cash_flow` | Cash flow statement |
| `statutory_contingent_liabilities` | Contingent liabilities |
| `statutory_related_party` | Related party transactions |

### Financial Analysis (11 tools)
| Tool | Description |
|------|-------------|
| `financial_trial_balance` | Trial Balance |
| `financial_profit_loss` | Profit & Loss |
| `financial_balance_sheet` | Balance Sheet |
| `financial_ratios` | Financial ratios |
| `financial_debtors_aging` | Debtors aging |
| `financial_creditors_aging` | Creditors aging |
| `financial_msme_payables` | MSME payables |
| `financial_stock_summary` | Stock summary |
| `financial_day_book` | Day book |
| `financial_ledger_statement` | Ledger statement |
| `financial_group_summary` | Group summary |

## Compliance Coverage

### Income Tax Act
- Section 44AB (Tax Audit)
- Section 40A(3) (Cash payment disallowance)
- Section 43B(h) (MSME payment disallowance)
- Section 194C, 194H, 194I, 194J (TDS sections)
- Section 206AA (Higher TDS for no PAN)

### GST Act
- GSTR-1 (Outward supplies)
- GSTR-2A/2B (Inward supplies)
- GSTR-3B (Summary return)
- E-Way Bill compliance
- E-Invoice (IRN) compliance
- ITC eligibility (Section 17(5))

### Companies Act 2013
- Schedule III (Financial statements format)
- Section 128 (Audit trail)
- AS-3 / Ind AS 7 (Cash flow)
- AS-18 (Related party)

## Troubleshooting

### Connection Issues
1. Ensure Tally is running
2. Check ODBC Server is enabled in Tally
3. Verify port number (default: 9000)
4. Check firewall settings

### No Data Returned
1. Verify company is selected
2. Check date range format (YYYY-MM-DD)
3. Ensure data exists for the period

### Performance
- For large datasets, use specific date ranges
- First request may be slower as Tally processes data

## Support

For issues and feature requests, please contact:
- Technical support for Tally integration
- CA practice automation queries

## License

MIT License

## Disclaimer

This tool is designed to assist Chartered Accountants in data extraction from Tally. Users are responsible for verifying the accuracy of extracted data before using it for statutory compliance or filing purposes.

---

**Built for Indian Chartered Accountants** | Tally ERP Integration | GST | TDS | Tax Audit | Companies Act
