import type {ReactNode} from "react";
import {Check} from "lucide-react";

const FEATURES = [
  "Conectare directă la SPV / e-Factura",
  "Curs valutar BNR actualizat automat",
  "Facturi conforme, fără griji",
];

// Shared split-screen auth chrome: dark brand panel (left) + form slot (right).
export function AuthLayout({children}: {children: ReactNode}) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[var(--text)] p-12 text-[var(--bg)] md:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-[var(--accent)] text-lg font-extrabold text-white">
            B
          </span>
          <span className="text-[19px] font-bold tracking-tight">BillWise</span>
        </div>
        <div className="max-w-[380px]">
          <h1 className="mb-[18px] text-[34px] font-bold leading-[1.15] tracking-tight text-balance">
            Facturarea, făcută simplu pentru firma ta.
          </h1>
          <p className="mb-7 text-[15px] leading-[1.6] text-[color-mix(in_srgb,var(--bg)_62%,transparent)]">
            e-Factura ANAF, TVA pe cote, serii automate și curs BNR — tot ce-ți trebuie ca să emiți o factură în sub 30
            de secunde.
          </p>
          <div className="flex flex-col gap-[13px]">
            {FEATURES.map((f) => (
              <div
                key={f}
                className="flex items-center gap-2.5 text-[14px] text-[color-mix(in_srgb,var(--bg)_82%,transparent)]"
              >
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white">
                  <Check size={13} strokeWidth={2.6} />
                </span>
                {f}
              </div>
            ))}
          </div>
        </div>
        <small className="text-[12.5px] text-[color-mix(in_srgb,var(--bg)_45%,transparent)]">
          Conform cerințelor ANAF · SPV / e-Factura · GDPR
        </small>
      </section>

      <section className="flex items-center justify-center bg-[var(--bg)] px-6 py-10">
        <div className="w-full max-w-[380px]">{children}</div>
      </section>
    </div>
  );
}

export const authInputCls =
  "h-11 w-full rounded-[11px] border border-[var(--strong)] bg-[var(--bg)] px-3.5 text-[14.5px] text-[var(--text)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--faint)]";

export const authLabelCls = "mb-1.5 block text-[12.5px] font-semibold text-[var(--text-muted)]";
