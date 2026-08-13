export type CanonicalField =
  | "Company"
  | "CounterpartyId"
  | "CounterpartyName"
  | "Bank"
  | "Account"
  | "Currency"
  | "Amount"
  | "DebitCredit"
  | "DocumentNo"
  | "DocumentType"
  | "PostingDate"
  | "DocumentDate"
  | "DueDate"
  | "ValueDate"
  | "Description"
  | "Assignment"
  | "Reference"
  | "Balance"
  | "RestrictedAmount"
  | "DebtId"
  | "Lender"
  | "InstrumentType"
  | "OutstandingPrincipal"
  | "InterestType"
  | "AnnualInterestRate"
  | "NextPaymentDate"
  | "NextPaymentAmount"
  | "MaturityDate";

export const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  Company: [
    "BUKRS",
    "COMPANY",
    "COMPANY_CODE",
    "COMPANY CODE",
    "ENTITY",
    "LEGAL_ENTITY",
    "ŞİRKET",
    "SIRKET",
  ],

  CounterpartyId: [
    "LIFNR",
    "KUNNR",
    "VENDOR",
    "VENDOR_ID",
    "CUSTOMER",
    "CUSTOMER_ID",
    "COUNTERPARTY_ID",
    "TEDARIKCI_KODU",
    "MUSTERI_KODU",
  ],

  CounterpartyName: [
    "NAME1",
    "VENDOR_NAME",
    "CUSTOMER_NAME",
    "COUNTERPARTY",
    "COUNTERPARTY_NAME",
    "TEDARIKCI",
    "TEDARİKÇİ",
    "MUSTERI",
    "MÜŞTERİ",
  ],

  Bank: [
    "HBKID",
    "HOUSE_BANK",
    "HOUSE BANK",
    "BANK",
    "BANK_NAME",
    "BANKA",
  ],

  Account: [
    "HKTID",
    "ACCOUNT",
    "ACCOUNT_NO",
    "ACCOUNT_NUMBER",
    "BANK_ACCOUNT",
    "BANK ACCOUNT",
    "HESAP",
    "HESAP_NO",
  ],

  Currency: [
    "WAERS",
    "CURRENCY",
    "CURRENCY_CODE",
    "CCY",
    "CURR",
    "DÖVİZ",
    "DOVIZ",
    "PARA_BIRIMI",
  ],

  Amount: [
    "DMBTR",
    "WRBTR",
    "AMOUNT",
    "LOCAL_AMOUNT",
    "AMOUNT_IN_LOCAL_CURRENCY",
    "DOCUMENT_AMOUNT",
    "VALUE",
    "TUTAR",
  ],

  DebitCredit: [
    "SHKZG",
    "DEBIT_CREDIT",
    "DEBIT_CREDIT_INDICATOR",
    "DC_INDICATOR",
    "DR_CR",
  ],

  DocumentNo: [
    "BELNR",
    "DOCUMENT_NO",
    "DOCUMENT_NUMBER",
    "DOC_NO",
    "BELGE_NO",
  ],

  DocumentType: [
    "BLART",
    "DOCUMENT_TYPE",
    "DOC_TYPE",
    "TYPE",
    "BELGE_TURU",
  ],

  PostingDate: [
    "BUDAT",
    "POSTING_DATE",
    "POSTING DATE",
    "KAYIT_TARIHI",
  ],

  DocumentDate: [
    "BLDAT",
    "DOCUMENT_DATE",
    "DOCUMENT DATE",
    "BELGE_TARIHI",
  ],

  DueDate: [
    "ZFBDT",
    "FAEDT",
    "DUE_DATE",
    "DUE DATE",
    "NET_DUE_DATE",
    "NET DUE DATE",
    "VADE_TARIHI",
    "VADE TARİHİ",
  ],

  ValueDate: [
    "VALUT",
    "VALUE_DATE",
    "VALUE DATE",
    "VALÖR",
    "VALOR",
  ],

  Description: [
    "SGTXT",
    "BKTXT",
    "TEXT",
    "DESCRIPTION",
    "HEADER_TEXT",
    "ITEM_TEXT",
    "AÇIKLAMA",
    "ACIKLAMA",
  ],

  Assignment: [
    "ZUONR",
    "ASSIGNMENT",
    "ASSIGNMENT_NUMBER",
  ],

  Reference: [
    "XBLNR",
    "REFERENCE",
    "REFERENCE_NO",
    "REFERENCE_NUMBER",
    "REFERANS",
  ],

  Balance: [
    "BALANCE",
    "AVAILABLE_BALANCE",
    "CASH_BALANCE",
    "BANK_BALANCE",
    "SALDO",
    "BAKIYE",
  ],

  RestrictedAmount: [
    "RESTRICTED_AMOUNT",
    "BLOCKED_AMOUNT",
    "RESTRICTED_CASH",
    "BLOCKED_CASH",
    "BLOKE_TUTAR",
  ],

  DebtId: [
    "DEBT_ID",
    "LOAN_ID",
    "FACILITY_ID",
    "CREDIT_ID",
    "KREDI_NO",
  ],

  Lender: [
    "LENDER",
    "CREDITOR",
    "FINANCIER",
    "LENDER_NAME",
  ],

  InstrumentType: [
    "INSTRUMENT_TYPE",
    "LOAN_TYPE",
    "FACILITY_TYPE",
    "BORC_TURU",
  ],

  OutstandingPrincipal: [
    "OUTSTANDING_PRINCIPAL",
    "PRINCIPAL",
    "LOAN_BALANCE",
    "OUTSTANDING_BALANCE",
    "KALAN_ANAPARA",
    "ANAPARA",
  ],

  InterestType: [
    "INTEREST_TYPE",
    "RATE_TYPE",
    "FAIZ_TIPI",
  ],

  AnnualInterestRate: [
    "ANNUAL_INTEREST_RATE",
    "INTEREST_RATE",
    "RATE",
    "FAIZ_ORANI",
  ],

  NextPaymentDate: [
    "NEXT_PAYMENT_DATE",
    "NEXT_DUE_DATE",
    "SONRAKI_ODEME_TARIHI",
  ],

  NextPaymentAmount: [
    "NEXT_PAYMENT_AMOUNT",
    "INSTALLMENT",
    "INSTALLMENT_AMOUNT",
    "TAKSIT_TUTARI",
  ],

  MaturityDate: [
    "MATURITY_DATE",
    "LOAN_MATURITY",
    "END_DATE",
    "FINAL_MATURITY_DATE",
  ],
};

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const aliasIndex = new Map<string, CanonicalField>();

for (const [canonicalField, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) {
    aliasIndex.set(
      normalizeHeader(alias),
      canonicalField as CanonicalField,
    );
  }
}

export function findExactAlias(
  sourceColumn: string,
): CanonicalField | null {
  return aliasIndex.get(normalizeHeader(sourceColumn)) ?? null;
}