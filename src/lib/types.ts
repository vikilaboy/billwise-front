// API response types — mirror the billwise-api Resource classes exactly.
// Money is integer cents. Laravel decimal casts serialize as STRINGS
// (exchange_rate, quantity, vat_rate), not numbers.

export type Tenant = {id: string; name: string; slug: string};

export type User = {
  id: string;
  name: string;
  email: string;
  tenant: Tenant;
  roles: string[];
  permissions: string[];
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
  address: Address | null;
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
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  subtotal_cents_ron: number | null;
  vat_cents_ron: number | null;
  total_cents_ron: number | null;
  lines: InvoiceLine[]; // [] in list, populated in show
  vat_breakdown: VatBreakdownGroup[]; // [] in list, populated in show
  created_at: string | null;
  updated_at: string | null;
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
  submitted_at: string | null;
  created_at: string | null;
};
