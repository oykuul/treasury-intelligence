export type CanonicalField =
  | "Company"
  | "FiscalYear"
  | "CounterpartyId"
  | "CounterpartyName"
  | "Bank"
  | "Account"
  | "Currency"
  | "Amount"
  | "DebitCredit"
  | "DocumentNo"
  | "LineItemNo"
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

export const FIELD_ALIASES: Record<
  CanonicalField,
  string[]
> = {
  Company: [
    "BUKRS",
    "COMPANY",
    "COMPANYCODE",
    "COMPANY_CODE",
    "SIRKET",
    "SIRKETKODU",
  ],

  FiscalYear: [
    "GJAHR",
    "FISCALYEAR",
    "FISCAL_YEAR",
    "MALIYIL",
    "MALI_YIL",
  ],

  CounterpartyId: [
    "LIFNR",
    "KUNNR",
    "COUNTERPARTYID",
    "COUNTERPARTY_ID",
    "SUPPLIERID",
    "SUPPLIER_ID",
    "VENDORID",
    "VENDOR_ID",
    "CUSTOMERID",
    "CUSTOMER_ID",
    "TEDARIKCIKODU",
    "MUSTERIKODU",
  ],

  CounterpartyName: [
    "NAME1",
    "COUNTERPARTY",
    "COUNTERPARTYNAME",
    "COUNTERPARTY_NAME",
    "SUPPLIER",
    "SUPPLIERNAME",
    "SUPPLIER_NAME",
    "VENDOR",
    "VENDORNAME",
    "VENDOR_NAME",
    "CUSTOMER",
    "CUSTOMERNAME",
    "CUSTOMER_NAME",
    "TEDARIKCI",
    "TEDARIKCIADI",
    "MUSTERI",
    "MUSTERIADI",
  ],

  Bank: [
    "HBKID",
    "BANK",
    "BANKID",
    "BANK_ID",
    "BANKA",
    "BANKAKODU",
  ],

  Account: [
    "HKTID",
    "ACCOUNT",
    "ACCOUNTID",
    "ACCOUNT_ID",
    "BANKACCOUNT",
    "BANK_ACCOUNT",
    "HESAP",
    "HESAPKODU",
  ],

  Currency: [
    "WAERS",
    "CURRENCY",
    "CURRENCYCODE",
    "CURRENCY_CODE",
    "CCY",
    "DOVIZ",
    "DOVIZCINSI",
    "PARABIRIMI",
  ],

  Amount: [
    "DMBTR",
    "WRBTR",
    "AMOUNT",
    "AMOUNTLC",
    "AMOUNT_LC",
    "TUTAR",
    "TUTARI",
  ],

  DebitCredit: [
    "SHKZG",
    "DEBITCREDIT",
    "DEBIT_CREDIT",
    "DEBITCREDITINDICATOR",
    "DEBIT_CREDIT_INDICATOR",
    "BORCALACAK",
  ],

  DocumentNo: [
    "BELNR",
    "DOCUMENTNO",
    "DOCUMENT_NO",
    "DOCUMENTNUMBER",
    "DOCUMENT_NUMBER",
    "DOCNO",
    "DOC_NO",
    "BELGENO",
    "BELGE_NO",
  ],

  LineItemNo: [
    "BUZEI",
    "LINEITEMNO",
    "LINE_ITEM_NO",
    "LINEITEMNUMBER",
    "LINE_ITEM_NUMBER",
    "ITEMNO",
    "ITEM_NO",
    "KALEMNO",
    "KALEM_NO",
  ],

  DocumentType: [
    "BLART",
    "DOCUMENTTYPE",
    "DOCUMENT_TYPE",
    "DOCTYPE",
    "DOC_TYPE",
    "BELGETURU",
  ],

  PostingDate: [
    "BUDAT",
    "POSTINGDATE",
    "POSTING_DATE",
    "KAYITTARIHI",
  ],

  DocumentDate: [
    "BLDAT",
    "DOCUMENTDATE",
    "DOCUMENT_DATE",
    "BELGETARIHI",
  ],

  DueDate: [
    "ZFBDT",
    "FAEDT",
    "DUEDATE",
    "DUE_DATE",
    "VADETARIHI",
    "VADE",
  ],

  ValueDate: [
    "VALUT",
    "VALUEDATE",
    "VALUE_DATE",
    "VALORTARIHI",
    "VALOR",
  ],

  Description: [
    "SGTXT",
    "BKTXT",
    "DESCRIPTION",
    "TEXT",
    "ACIKLAMA",
  ],

  Assignment: [
    "ZUONR",
    "ASSIGNMENT",
    "ASSIGNMENTNO",
    "ASSIGNMENT_NO",
  ],

  Reference: [
    "XBLNR",
    "REFERENCE",
    "REFERENCENO",
    "REFERENCE_NO",
    "REFERANS",
    "REFERANSNO",
  ],

  Balance: [
    "BALANCE",
    "ENDINGBALANCE",
    "ENDING_BALANCE",
    "BAKIYE",
  ],

  RestrictedAmount: [
    "RESTRICTEDAMOUNT",
    "RESTRICTED_AMOUNT",
    "BLOCKEDAMOUNT",
    "BLOCKED_AMOUNT",
    "KISITLITUTAR",
  ],

  DebtId: [
    "DEBTID",
    "DEBT_ID",
    "LOANID",
    "LOAN_ID",
    "CREDITID",
    "CREDIT_ID",
    "BORCID",
  ],

  Lender: [
    "LENDER",
    "LENDERNAME",
    "LENDER_NAME",
    "CREDITOR",
    "KREDITORKURUM",
  ],

  InstrumentType: [
    "INSTRUMENTTYPE",
    "INSTRUMENT_TYPE",
    "DEBTTYPE",
    "DEBT_TYPE",
    "LOANTYPE",
    "LOAN_TYPE",
    "URUNTURU",
  ],

  OutstandingPrincipal: [
    "OUTSTANDINGPRINCIPAL",
    "OUTSTANDING_PRINCIPAL",
    "PRINCIPAL",
    "PRINCIPALAMOUNT",
    "PRINCIPAL_AMOUNT",
    "ANAPARA",
    "KALANANAPARA",
  ],

  InterestType: [
    "INTERESTTYPE",
    "INTEREST_TYPE",
    "RATETYPE",
    "RATE_TYPE",
    "FAIZTURU",
  ],

  AnnualInterestRate: [
    "ANNUALINTERESTRATE",
    "ANNUAL_INTEREST_RATE",
    "INTERESTRATE",
    "INTEREST_RATE",
    "RATE",
    "FAIZORANI",
  ],

  NextPaymentDate: [
    "NEXTPAYMENTDATE",
    "NEXT_PAYMENT_DATE",
    "NEXTPAYMENT",
    "NEXT_PAYMENT",
    "SONRAKIodemeTARIHI",
    "SONRAKI_ODEME_TARIHI",
  ],

  NextPaymentAmount: [
    "NEXTPAYMENTAMOUNT",
    "NEXT_PAYMENT_AMOUNT",
    "INSTALLMENTAMOUNT",
    "INSTALLMENT_AMOUNT",
    "SONRAKIODEMETUTARI",
    "SONRAKI_ODEME_TUTARI",
  ],

  MaturityDate: [
    "MATURITYDATE",
    "MATURITY_DATE",
    "MATURITY",
    "VADESONU",
    "VADESONUTARIHI",
  ],
};

export function normalizeHeader(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      "",
    );
}

const aliasIndex =
  new Map<
    string,
    CanonicalField
  >();

for (
  const [
    canonicalField,
    aliases,
  ] of Object.entries(
    FIELD_ALIASES,
  ) as [
    CanonicalField,
    string[],
  ][]
) {
  aliasIndex.set(
    normalizeHeader(
      canonicalField,
    ),
    canonicalField,
  );

  for (const alias of aliases) {
    aliasIndex.set(
      normalizeHeader(alias),
      canonicalField,
    );
  }
}

export function findExactAlias(
  sourceColumn: string,
): CanonicalField | null {
  return (
    aliasIndex.get(
      normalizeHeader(
        sourceColumn,
      ),
    ) ?? null
  );
}