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

export type SessionPayload =
  | {
      status: "authenticated" | "exchange_pending_confirmation";
      csrf_token?: string;
      user: User;
    }
  | {
      status: "mfa_required";
      csrf_token: string;
      expires_at: string;
    }
  | {
      status: "mfa_reenrollment_required";
      csrf_token: string;
      factor_id: string;
      secret: string;
      provisioning_uri: string;
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
  archived_at: string | null;
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

export type Supplier = {id: string | null; name: string; tax_id: string | null; country_code: string; email: string | null; address: string | null};
export type PurchaseInvoiceLine = {id: string; position: number; description: string; quantity: string; unit_code: string | null; unit_price_cents: number; subtotal_cents: number; vat_rate: string; vat_cents: number};
export type PurchaseInvoice = {
  id: string; document_type: "invoice" | "credit_note"; number: string; issue_date: string; due_date: string | null; currency: string;
  referenced_invoice_number: string | null; referenced_invoice_issue_date: string | null; corrects_purchase_invoice_id: string | null;
  subtotal_cents: number; vat_cents: number; total_cents: number; import_status: string; review_status: "unreviewed" | "reviewed" | "needs_attention";
  reviewed_at: string | null; supplier: Supplier | null; vault_item_id: string; lines: PurchaseInvoiceLine[]; created_at: string | null;
};
export type FiscalVaultItem = {
  id: string; source: string; direction: "received"; document_type: string | null; document_number: string | null; issue_date: string | null;
  supplier_name: string | null; supplier_tax_id: string | null; status: "archiving" | "archived" | "imported" | "needs_attention" | "storage_failed" | "unsupported"; signature_status: "preserved_not_verified";
  archived_at: string | null; retention_policy: "legal_general" | "extended"; retain_until: string | null; legal_hold_at: string | null; last_verified_at: string | null; integrity_status: "pending" | "verified" | "failed";
  original: {filename: string; size_bytes: number; sha256: string} | null; purchase_invoice_id: string | null;
  anaf_message_id: string | null; anaf_download_id: string | null; anaf_available_at: string | null;
};
export type FiscalVaultExport = {
  id: string;
  status: "queued" | "processing" | "ready" | "failed";
  from_date: string | null;
  to_date: string | null;
  document_count: number | null;
  source_size_bytes: number | null;
  size_bytes: number | null;
  sha256: string | null;
  expires_at: string | null;
  failure: {
    code: "processing_timeout" | "integrity_failed" | "generation_failed";
    message: string;
  } | null;
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
  kind: "business" | "individual";
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
    document_type?: InvoiceDocumentType;
    financial_direction?: FinancialDirection;
    issue_date: string | null;
    due_date: string | null;
    currency: string;
    total_cents: number;
    signed_total_cents?: number;
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
  vat_profile_id: string | null;
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type InvoiceStatus = "draft" | "issued" | "cancelled";
export type InvoiceDocumentType = "invoice" | "correction" | "credit_note";
export type FinancialDirection = "debit" | "credit";
export type InvoiceAdjustmentReason = "return" | "price_correction" | "post_sale_discount" | "volume_rebate" | "contract_adjustment" | "cancellation" | "other";
export type InvoiceExchangeRateBasis = "issue_date" | "original_invoice" | "referenced_invoices" | "manual_documented";

export type VatCategory = "S" | "AE" | "E" | "Z" | "K" | "G" | "O";

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: string; // decimal:2
  unit: string | null;
  unit_code: string | null;
  unit_price_cents: number;
  vat_rate: string; // decimal:2, e.g. "19.00"
  vat_profile_id: string | null;
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
  source_contract_version_line_id: string | null;
  corrects_invoice_line_id: string | null;
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

export type InvoiceBankAccountSnapshot = {
  bank_name: string;
  scheme: "iban" | "uk_domestic" | "us_domestic";
  currency_code: string | null;
  iban: string | null;
  swift_bic: string | null;
  sort_code: string | null;
  account_number: string | null;
  routing_number: string | null;
};

export type Invoice = {
  id: string;
  company_profile: CompanyProfile | null;
  customer: Customer | null;
  status: InvoiceStatus;
  document_type: InvoiceDocumentType;
  financial_direction: FinancialDirection;
  adjustment_reason: InvoiceAdjustmentReason | null;
  adjustment_description: string | null;
  corrects_invoice_id: string | null;
  corrected_invoice: {
    id: string;
    formatted_number: string;
    status: InvoiceStatus;
    total_cents: number;
    currency: string;
  } | null;
  corrections: Array<{
    id: string;
    formatted_number: string;
    status: InvoiceStatus;
    total_cents: number;
    signed_total_cents: number;
    currency: string;
  }>;
  number: number;
  formatted_number: string;
  invoice_series_id?: string;
  issue_date: string | null;
  due_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  issued_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  currency: string;
  exchange_rate: string | null; // decimal:6
  exchange_rate_day: string | null;
  exchange_rate_source: string | null;
  exchange_rate_basis: InvoiceExchangeRateBasis | null;
  exchange_rate_basis_note: string | null;
  source_type: "manual" | "recurring" | "duplicate" | string;
  source_recurring_run_id: string | null;
  source_contract_id: string | null;
  source_contract_version_id: string | null;
  contract_source: {id: string; number: string; name: string; version_id: string | null; version: number | null} | null;
  recurring_source: {
    run_id: string;
    template_id: string;
    template_name: string | null;
    version_id: string;
    version: number | null;
    scheduled_for: string;
    render_context: {
      period_start: string;
      period_end: string;
      working_days?: {working_days: number; excluded_holidays: Array<{day: string; name: string}>};
      lines?: Array<{working_days: number | null; hours_per_day: string | null; quantity: string; unit_price_cents: number}>;
    } | null;
  } | null;
  notes: string | null;
  locale: "ro" | "en";
  bank_accounts_snapshot: InvoiceBankAccountSnapshot[];
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  signed_subtotal_cents: number;
  signed_vat_cents: number;
  signed_total_cents: number;
  subtotal_cents_ron: number | null;
  vat_cents_ron: number | null;
  total_cents_ron: number | null;
  signed_subtotal_cents_ron: number | null;
  signed_vat_cents_ron: number | null;
  signed_total_cents_ron: number | null;
  paid_cents: number;
  issued_corrections_cents: number;
  adjusted_total_cents: number;
  credit_allocations_cents: number;
  balance_cents: number;
  overpaid_cents: number;
  available_overpaid_cents: number;
  allocated_credit_cents: number;
  refunded_credit_cents: number;
  available_credit_cents: number;
  payment_status: "unpaid" | "partial" | "paid" | "overdue" | "not_applicable";
  last_paid_at: string | null;
  lines: InvoiceLine[]; // [] in list, populated in show
  vat_breakdown: VatBreakdownGroup[]; // [] in list, populated in show
  references: Array<{
    id: string;
    invoice_id: string;
    formatted_number: string | null;
    tax_groups: Array<{
      vat_category: VatCategory;
      vat_rate: string;
      taxable_cents: number;
      vat_cents: number;
      total_cents: number;
      taxable_cents_ron: number;
      vat_cents_ron: number;
      total_cents_ron: number;
    }>;
  }>;
  latest_efactura_submission: EfacturaSubmission | null;
  efactura_eligibility: {
    eligible: boolean;
    reason: "invoice_not_issued" | "customer_address_missing" | "outside_jurisdiction" | null;
  };
  created_at: string | null;
  updated_at: string | null;
};

export type CustomerCreditUsage = {
  id: string;
  company_profile_id: string;
  customer_id: string;
  source_credit_note_id: string | null;
  source_overpaid_invoice_id: string | null;
  source_document: {id: string; formatted_number: string; document_type: InvoiceDocumentType} | null;
  type: "allocation" | "refund";
  target_invoice_id: string | null;
  target_document: {id: string; formatted_number: string; document_type: InvoiceDocumentType} | null;
  amount_cents: number;
  currency: string;
  occurred_at: string;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
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

export type InvoiceDelivery = {
  id: string;
  channel: "email";
  recipient: string;
  cc: string[];
  subject: string;
  message: string | null;
  status: "queued" | "preparing" | "sending" | "sent" | "failed" | "outcome_unknown";
  provider_message_id: string | null;
  requires_duplicate_confirmation: boolean;
  error: string | null;
  sent_at: string | null;
  created_at: string | null;
};

export type DashboardSummary = {
  total_invoiced_ron_cents: number;
  total_paid_ron_cents: number;
  balance_ron_cents: number;
  available_credit_ron_cents: number;
  available_overpayment_ron_cents: number;
  net_customer_position_ron_cents: number;
  overdue_count: number;
  draft_count: number;
  billed_this_month_ron_cents: number;
  issued_this_month_count: number;
  previous_month_invoiced_ron_cents: number;
  same_month_last_year_invoiced_ron_cents: number;
  outstanding_balance_ron_cents: number;
  overdue_balance_ron_cents: number;
  outstanding_count: number;
  draft_total_ron_cents: number;
  weekly_invoiced_ron_cents: number[];
  weekly_overdue_balance_ron_cents: number[];
  monthly_invoiced_ron_cents: Array<{
    month: string;
    total_ron_cents: number;
  }>;
  recent_invoices: Invoice[];
  as_of: string;
  outstanding: {
    balance_ron_cents: number;
    invoice_count: number;
  };
  overdue: {
    balance_ron_cents: number;
    invoice_count: number;
    share_percent: number;
  };
  attention: {
    total: number;
    critical: number;
    warning: number;
  };
};

export type DashboardPeriod = {
  from: string;
  to: string;
  preset: string;
  bucket: "day" | "week" | "month";
};

export type DashboardPerformance = {
  period: DashboardPeriod;
  comparison_period: {from: string; to: string} | null;
  summary: {
    invoiced_ron_cents: number;
    issued_document_count: number;
    issued_invoice_count: number;
    issued_credit_document_count: number;
    collected_ron_cents: number;
    invoice_with_payment_count: number;
  };
  comparison: {
    invoiced_ron_cents: number;
    issued_document_count: number;
    issued_invoice_count: number;
    issued_credit_document_count: number;
    collected_ron_cents: number;
    invoice_with_payment_count: number;
    invoiced_change_percent: number | null;
    collected_change_percent: number | null;
  } | null;
  series: Array<{
    from: string;
    to: string;
    invoiced_ron_cents: number;
    collected_ron_cents: number;
  }>;
};

export type DashboardAging = {
  as_of: string;
  total_balance_ron_cents: number;
  invoice_count: number;
  buckets: Array<{
    key: "current" | "overdue_1_30" | "overdue_31_60" | "overdue_61_90" | "overdue_over_90";
    balance_ron_cents: number;
    invoice_count: number;
    share_percent: number;
    filter: Record<string, string | number | string[]>;
  }>;
};

export type DashboardEfactura = {
  period: DashboardPeriod;
  connection: {
    status: "disconnected" | "reconnect_required" | "active" | "refreshable";
    connected: boolean;
    reauthorization_required: boolean;
    last_synced_at: string | null;
    last_error_code: string | null;
  };
  eligible_document_count: number;
  eligible_value_ron_cents: number;
  accepted_percent: number;
  buckets: Array<{
    key: "not_submitted" | "pending" | "accepted" | "problem";
    document_count: number;
    value_ron_cents: number;
  }>;
};

export type DashboardPurchases = {
  period: DashboardPeriod;
  comparison_period: {from: string; to: string} | null;
  summary: {
    document_count: number;
    supplier_count: number;
    unreviewed_count: number;
    reviewed_count: number;
    needs_attention_count: number;
    totals_by_currency: Array<{currency: string; document_count: number; total_cents: number}>;
  };
  comparison: {
    document_count: number;
    document_count_change_percent: number | null;
  } | null;
  series: Array<{from: string; to: string; document_count: number}>;
};

export type DashboardAttention = {
  total: number;
  critical: number;
  warning: number;
  items: Array<{
    kind: string;
    severity: "critical" | "warning" | "info";
    title: string;
    message: string;
    target: string;
    date: string | null;
    invoice_id: string | null;
    amount_cents: number | null;
    currency: string | null;
  }>;
};

export type RecurringInvoiceTemplate = {
  id: string;
  billing_source: "custom" | "contract";
  contract_id: string | null;
  contract_version_id: string | null;
  contract_line_ids: string[];
  contract: {id: string; number: string; name: string; version: number} | null;
  company_profile_id: string;
  customer_id: string;
  invoice_series_id: string;
  name: string;
  frequency: "monthly" | "quarterly" | "custom";
  schedule: {
    unit: "week" | "month";
    interval: number;
    weekdays: number[] | null;
    month_days: Array<number | "last_day"> | null;
    run_time: string;
    timezone: string;
    start_date: string;
    end_date: string | null;
  };
  period_strategy: "previous_schedule_window";
  contract_number: string | null;
  contract_date: string | null;
  is_locked: boolean;
  locked_at: string | null;
  timezone: string;
  start_date: string;
  end_date: string | null;
  next_run_at: string;
  payment_terms_days: number;
  currency: string;
  locale: "ro" | "en";
  lines: Array<{
    description: string;
    description_template: string;
    quantity: string;
    unit: string;
    unit_code: string;
    unit_price_cents: number;
    vat_rate: string;
    vat_profile_id: string | null;
    vat_category: VatCategory;
    vat_exemption_code: string | null;
    vat_exemption_reason: string | null;
  }>;
  notes: string | null;
  status: "active" | "paused" | "archived";
  mode: "create_draft";
  customer: {id: string; name: string} | null;
  series: {id: string; name: string} | null;
  runs: Array<{
    id: string;
    scheduled_for: string;
    status: "running" | "created" | "failed" | "skipped";
    error: string | null;
    invoice_id: string | null;
  }>;
};

export type ContractBillingModel = "fixed_quantity" | "working_days_hours";

export type ContractVersionLine = {
  id: string;
  product_id: string | null;
  name: string;
  description_template: string;
  billing_model: ContractBillingModel;
  quantity: string | null;
  hours_per_day: string | null;
  unit: string;
  unit_code: string;
  unit_price_cents: number;
  vat_profile_id: string | null;
  vat_rate: string;
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
  position: number;
};

export type ContractVersion = {
  id: string;
  version: number;
  status: "draft" | "active" | "superseded";
  effective_from: string;
  currency: string;
  payment_terms_days: number;
  locale: "ro" | "en";
  timezone: string;
  working_weekdays: number[];
  holiday_calendar_code: string | null;
  default_hours_per_day: string | null;
  notes: string | null;
  lines: ContractVersionLine[];
};

export type Contract = {
  id: string;
  customer_id: string;
  number: string;
  name: string;
  signed_on: string;
  starts_on: string;
  ends_on: string | null;
  status: "draft" | "active" | "ended" | "archived";
  archived_from_status: "draft" | "ended" | null;
  customer: {id: string; name: string} | null;
  current_version: ContractVersion | null;
  versions: ContractVersion[];
  recurring_templates_count: number | null;
};

export type ActivityNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

export type ActivityNotificationFeed = {
  unread_count: number;
  items: ActivityNotification[];
};

export type SpvSubmissionStatus =
  | "queued"
  | "sending"
  | "sent"
  | "processing"
  | "accepted"
  | "rejected"
  | "failed"
  | "delivery_unknown";

export type EfacturaSubmission = {
  id: string;
  status: SpvSubmissionStatus;
  upload_index: string | null;
  download_id: string | null;
  error: string | null;
  last_error_code: string | null;
  has_confirmation: boolean;
  next_poll_at: string | null;
  last_polled_at: string | null;
  poll_attempts: number;
  submitted_at: string | null;
  created_at: string | null;
};

export type SpvConnection = {
  status: "disconnected" | "active" | "refreshable" | "reconnect_required";
  connected: boolean;
  access_token_expires_at: string | null;
  reauthorization_required: boolean;
  last_error_code: string | null;
  inbox_auto_sync_enabled: boolean;
  inbox_enabled_at: string | null;
  inbox_cursor_at: string | null;
  inbox_last_synced_at: string | null;
  inbox_last_error_code: string | null;
  outbox_auto_sync_enabled: boolean;
  outbox_enabled_at: string | null;
  outbox_cursor_at: string | null;
  outbox_last_synced_at: string | null;
  outbox_last_error_code: string | null;
};

export type EfacturaSubmissionEvent = {
  id: string;
  event_type: string;
  status: SpvSubmissionStatus | null;
  error_code: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  occurred_at: string;
};

export type SpvAuthorize = {
  authorize_url: string;
};

export type SpvConnectionEvent = {
  id: string;
  type:
    | "authorization_started"
    | "authorization_denied"
    | "authorization_failed"
    | "connected"
    | "token_refreshed"
    | "reauthorization_required"
    | "disconnected";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  error_code: string | null;
  actor: {
    id: string;
    name: string;
  } | null;
  created_at: string;
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

export type VatProfile = {
  id: string;
  company_profile_id: string;
  name: string;
  rate: string;
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
  is_default: boolean;
  is_active: boolean;
  is_referenced: boolean;
};
