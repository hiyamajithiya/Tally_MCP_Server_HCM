import axios, { AxiosInstance } from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { TallyConfig, TallyCompany, TallyResponse } from '../types/tally.js';

export class TallyConnection {
  private config: TallyConfig;
  private client: AxiosInstance;
  private parser: XMLParser;
  private builder: XMLBuilder;

  constructor(config: TallyConfig = { host: 'localhost', port: 9000 }) {
    this.config = config;
    this.client = axios.create({
      baseURL: `http://${config.host}:${config.port}`,
      headers: {
        'Content-Type': 'application/xml',
      },
      timeout: 300000, // 5 minutes timeout for large data
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      parseTagValue: true,
      trimValues: true,
    });

    this.builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: true,
    });
  }

  async testConnection(): Promise<TallyResponse<boolean>> {
    try {
      const xml = `<ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Data</TYPE>
          <ID>List of Companies</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
          </DESC>
        </BODY>
      </ENVELOPE>`;

      const response = await this.client.post('', xml);
      return { success: true, data: true };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to connect to Tally: ${error.message}. Ensure Tally is running with ODBC Server enabled on port ${this.config.port}`
      };
    }
  }

  async executeRequest(xmlRequest: string): Promise<TallyResponse<any>> {
    try {
      const response = await this.client.post('', xmlRequest);
      const parsed = this.parser.parse(response.data);
      return { success: true, data: parsed, rawXml: response.data };
    } catch (error: any) {
      return {
        success: false,
        error: `Tally request failed: ${error.message}`,
        rawXml: error.response?.data
      };
    }
  }

  async getCompanyList(): Promise<TallyResponse<TallyCompany[]>> {
    const xml = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>CompanyCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="CompanyCollection">
                <TYPE>Company</TYPE>
                <FETCH>NAME, GUID, STARTINGFROM, ENDINGAT, BASICFINANCIALYEARFROM, BOOKSFROM, GSTIN, INCOMETAXNUMBER, TANREGNO, ADDRESS, LEDGERSTATENAME, PINCODE</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const response = await this.executeRequest(xml);
    if (!response.success) return response;

    try {
      const companies: TallyCompany[] = [];
      const envelope = response.data?.ENVELOPE;
      const companyData = envelope?.BODY?.DATA?.COLLECTION?.COMPANY;

      if (companyData) {
        const companyArray = Array.isArray(companyData) ? companyData : [companyData];
        for (const company of companyArray) {
          companies.push({
            name: company.NAME?.['#text'] || company.NAME || '',
            guid: company.GUID?.['#text'] || company.GUID || '',
            startingFrom: company.STARTINGFROM?.['#text'] || company.STARTINGFROM || '',
            endingAt: company.ENDINGAT?.['#text'] || company.ENDINGAT || '',
            financialYearFrom: company.BASICFINANCIALYEARFROM?.['#text'] || company.BASICFINANCIALYEARFROM || '',
            booksFrom: company.BOOKSFROM?.['#text'] || company.BOOKSFROM || '',
            gstNumber: company.GSTIN?.['#text'] || company.GSTIN || '',
            panNumber: company.INCOMETAXNUMBER?.['#text'] || company.INCOMETAXNUMBER || '',
            tanNumber: company.TANREGNO?.['#text'] || company.TANREGNO || '',
            address: this.extractAddress(company.ADDRESS),
            state: company.LEDGERSTATENAME?.['#text'] || company.LEDGERSTATENAME || '',
            pincode: company.PINCODE?.['#text'] || company.PINCODE || '',
          });
        }
      }

      return { success: true, data: companies };
    } catch (error: any) {
      return { success: false, error: `Failed to parse company list: ${error.message}` };
    }
  }

  async setCompany(companyName: string): Promise<TallyResponse<boolean>> {
    this.config.companyName = companyName;
    return { success: true, data: true };
  }

  getCompanyName(): string | undefined {
    return this.config.companyName;
  }

  buildXmlRequest(options: {
    type: 'Collection' | 'Object' | 'Data';
    id: string;
    collection?: string;
    fetch?: string[];
    filters?: string[];
    staticVariables?: Record<string, string>;
    tdl?: string;
  }): string {
    const staticVars = options.staticVariables || {};
    if (this.config.companyName) {
      staticVars['SVCURRENTCOMPANY'] = this.config.companyName;
    }

    let staticVarsXml = '<STATICVARIABLES>\n<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>';
    for (const [key, value] of Object.entries(staticVars)) {
      staticVarsXml += `\n<${key}>${value}</${key}>`;
    }
    staticVarsXml += '\n</STATICVARIABLES>';

    let tdlXml = '';
    if (options.tdl) {
      tdlXml = `<TDL><TDLMESSAGE>${options.tdl}</TDLMESSAGE></TDL>`;
    }

    return `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>${options.type}</TYPE>
        <ID>${options.id}</ID>
      </HEADER>
      <BODY>
        <DESC>
          ${staticVarsXml}
          ${tdlXml}
        </DESC>
      </BODY>
    </ENVELOPE>`;
  }

  private extractAddress(addressData: any): string {
    if (!addressData) return '';
    if (typeof addressData === 'string') return addressData;
    if (addressData['#text']) return addressData['#text'];

    // Handle multi-line address
    const lines = addressData['ADDRESS.LIST']?.ADDRESS;
    if (lines) {
      const lineArray = Array.isArray(lines) ? lines : [lines];
      return lineArray.map((l: any) => l['#text'] || l).join(', ');
    }
    return '';
  }

  // Helper to safely extract string from Tally XML value (handles #text objects)
  private extractStringValue(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (value['#text'] !== undefined) {
      const text = value['#text'];
      return typeof text === 'string' ? text : String(text);
    }
    if (typeof value === 'object') {
      // Try common Tally XML patterns
      if (value._ !== undefined) return String(value._);
      if (value.value !== undefined) return String(value.value);
    }
    return '';
  }

  parseAmount(value: any): number {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const str = this.extractStringValue(value);
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '')) || 0;
  }

  parseDate(value: any): string {
    if (!value) return '';
    const str = this.extractStringValue(value);
    if (!str) return '';
    // Tally date format: YYYYMMDD
    if (str.length === 8 && /^\d{8}$/.test(str)) {
      return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
    }
    return str;
  }

  formatTallyDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
}

export const createTallyConnection = (config?: TallyConfig): TallyConnection => {
  return new TallyConnection(config);
};
