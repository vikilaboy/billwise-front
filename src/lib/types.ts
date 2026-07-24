// API response types — mirror the billwise-api Resource classes exactly.
// Money is integer cents. Laravel decimal casts serialize as STRINGS
// (exchange_rate, quantity, vat_rate), not numbers.

export type Tenant = {id: string; name: string; slug: string};

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  email_verified_at: string | null;
  tenant: Tenant;
  roles: string[];
  permissions: string[];
};

export type RegisterPayload = {
  message: string;
  email: string;
};

export type AuthPayload = {
  access_token: string;
  token_type: string; // "Bearer"
  expires_at: string | null;
  user: User;
};

export type Address = {
  id: string;
  country_code: string;
  state_id: string | null;
  locality_id: string | null;
  region_name: string | null;
  city_name: string | null;
  street: string | null;
  street_details: string | null;
  postal_code: string | null;
  county_code: string | null; // derived, e.g. "B" / "CJ"
  resolved_city: string | null; // derived (free-text or looked-up locality)
  resolved_region: string | null; // derived (free-text or looked-up state)
};

export type CompanyProfile = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  tax_id: string | null; // CUI
  registration_number: string | null; // J.../reg number
  is_vat_payer: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: Address | null;
  created_at: string | null;
  updated_at: string | null;
};

export type FiscalEntity = {
  cui: string;
  name: string;
  is_vat_payer: boolean;
  registration_number: string | null;
  address: string | null;
  is_active: boolean;
};

export type State = {
  id: string;
  country_code: string;
  code: string;
  name: string;
};

export type Locality = {
  id: string;
  state_id: string;
  siruta_code: string;
  name: string;
  type: string | null;
  superior_siruta: string | null;
};

export type Customer = {
  id: string;
  company_profile_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tax_id: string | null; // CUI
  registration_number: string | null;
  is_vat_payer: boolean;
  notes: string | null;
  locale: "ro" | "en";
  address: Address | null;
  bank_accounts?: BankAccount[];
  recent_invoices?: Array<{
    id: string;
    formatted_number: string;
    status: InvoiceStatus;
    issue_date: string | null;
    due_date: string | null;
    currency: string;
    total_cents: number;
  }>;
  created_at: string | null;
  updated_at: string | null;
};

export type BankAccount = {
  id: string;
  company_profile_id: string;
  scheme: string; // BankAccountScheme: iban | uk_domestic | us_domestic
  bank_name: string | null;
  currency_id: string | null;
  iban: string | null;
  swift_bic: string | null;
  sort_code: string | null;
  account_number: string | null;
  routing_number: string | null;
  is_active: boolean;
  is_primary: boolean;
  position: number;
  created_at: string | null;
  updated_at: string | null;
};

export type Product = {
  id: string;
  company_profile_id: string;
  type: "product" | "service";
  name: string;
  description: string | null;
  unit: string;
  unit_code: string;
  unit_price_cents: number;
  currency: string;
  vat_rate: string;
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type InvoiceStatus = "draft" | "issued" | "cancelled";

export type VatCategory = "S" | "AE" | "E" | "Z" | "K" | "G" | "O";

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: string; // decimal:2
  unit: string | null;
  unit_code: string | null;
  unit_price_cents: number;
  vat_rate: string; // decimal:2, e.g. "19.00"
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  position: number;
};

export type VatBreakdownGroup = {
  vat_category: VatCategory;
  vat_rate: string;
  taxable_cents: number;
  vat_cents: number;
  taxable_cents_ron: number | null;
  vat_cents_ron: number | null;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
};

export type Invoice = {
  id: string;
  company_profile: CompanyProfile | null;
  customer: Customer | null;
  status: InvoiceStatus;
  number: number;
  formatted_number: string;
  issue_date: string | null;
  due_date: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  currency: string;
  exchange_rate: string | null; // decimal:6
  exchange_rate_day: string | null;
  notes: string | null;
  locale: "ro" | "en";
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  subtotal_cents_ron: number | null;
  vat_cents_ron: number | null;
  total_cents_ron: number | null;
  paid_cents: number;
  balance_cents: number;
  payment_status: "unpaid" | "partial" | "paid" | "overdue";
  last_paid_at: string | null;
  lines: InvoiceLine[]; // [] in list, populated in show
  vat_breakdown: VatBreakdownGroup[]; // [] in list, populated in show
  latest_efactura_submission: EfacturaSubmission | null;
  efactura_eligibility: {
    eligible: boolean;
    reason: "invoice_not_issued" | "customer_address_missing" | "outside_jurisdiction" | null;
  };
  created_at: string | null;
  updated_at: string | null;
};

export type PaymentMethod = "bank_transfer" | "card" | "cash" | "other";

export type InvoicePayment = {
  id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  paid_at: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DashboardSummary = {
  total_invoiced_ron_cents: number;
  total_paid_ron_cents: number;
  balance_ron_cents: number;
  overdue_count: number;
  draft_count: number;
  recent_invoices: Invoice[];
};

export type SpvSubmissionStatus =
  | "queued"
  | "sent"
  | "processing"
  | "accepted"
  | "rejected"
  | "failed";

export type EfacturaSubmission = {
  id: string;
  status: SpvSubmissionStatus;
  upload_index: string | null;
  download_id: string | null;
  error: string | null;
  has_confirmation: boolean;
  next_poll_after: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

export type SpvConnection = {
  connected: boolean;
  expires_at: string | null;
};

export type SpvAuthorize = {
  authorize_url: string;
};

export type Currency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  auto_update: boolean;
  is_local: boolean;
  is_active: boolean;
  latest_rate: {
    day: string | null;
    rate: string;
    source: string;
  } | null;
};
