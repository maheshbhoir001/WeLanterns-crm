import Image from "next/image";

export function BrandLockup({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className={`brand-lockup${compact ? " brand-lockup--compact" : ""}${light ? " brand-lockup--light" : ""}`}>
      <Image
        src="/brand/welanterns-logo.png"
        width={450}
        height={450}
        alt="WeLanterns lantern emblem"
        className="brand-lockup__logo"
        priority
      />
      <div className="brand-lockup__copy">
        <div className="brand-lockup__name"><span>WeLanterns</span> <em>Capital</em></div>
        <div className="brand-lockup__subtitle">Advisory Pvt. Ltd.</div>
        {!compact && <div className="brand-lockup__tagline">Wealth <i /> Growth <i /> Protection</div>}
      </div>
    </div>
  );
}
