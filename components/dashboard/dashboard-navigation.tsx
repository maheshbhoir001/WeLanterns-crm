"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight, BarChart3, BriefcaseBusiness, Building2, ChartNoAxesCombined,
  CheckSquare, ChevronDown, Download, FileText, HandCoins, LayoutDashboard,
  ListTodo, LogOut, Users, WalletCards,
} from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { signOutAction } from "@/app/actions/auth";
import type { LeadRole } from "@/lib/crm/leads";
import { getRoleDisplayName } from "@/lib/crm/display-names";

const verticalSlugs: Record<string, string> = {
  "WeLanterns Capital": "capital", "WeLanterns Media": "media", TradeStambh: "tradestambh",
  "Private Equity": "private-equity", "SME Advisory": "sme-advisory",
  "Loans & Credit Solutions": "loans-credit", "Group Operations": "operations",
};

const primary = [
  ["Overview", "/dashboard", LayoutDashboard], ["Leads", "/dashboard/leads", BriefcaseBusiness],
  ["Clients", "/dashboard/clients", Building2], ["Follow-ups", "/dashboard/followups", ListTodo],
  ["Tasks", "/dashboard/tasks", CheckSquare],
] as const;

export function DashboardNavigation({ role, verticals }: { role: LeadRole; verticals: string[] }) {
  const pathname = usePathname();
  const admin = role === "super_admin" || role === "group_admin";
  const permittedVerticals = verticals.flatMap((name) => verticalSlugs[name] ? [[name, verticalSlugs[name]] as const] : []);
  const links = [
    ...(admin ? [["Revenue", "/dashboard/revenue", HandCoins] as const] : []),
    ["Reports", "/dashboard/reports", ChartNoAxesCombined] as const,
    ["Exports", "/dashboard/exports", Download] as const,
    ...(admin ? [["Users", "/dashboard/users", Users] as const] : []),
  ];
  const linkItems = (mobile = false) => (
    <>
      {primary.map(([label, href, Icon]) => <Link key={href} href={href} className={`nav-link${pathname === href ? " nav-link--active" : ""}${mobile ? " nav-link--mobile" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>)}
      {permittedVerticals.length > 0 && <details className="nav-group" open={pathname.startsWith("/dashboard/") && permittedVerticals.some(([, slug]) => pathname.includes(`/${slug}`))}>
        <summary className="nav-link"><BarChart3 size={18} strokeWidth={1.8} /><span>Business verticals</span><ChevronDown className="nav-chevron" size={15} /></summary>
        <div className="nav-sublist">{permittedVerticals.map(([label, slug]) => <Link key={slug} className={`nav-sublink${pathname.endsWith(`/${slug}`) ? " nav-sublink--active" : ""}`} href={`/dashboard/${slug}`}>{label}</Link>)}</div>
      </details>}
      {links.map(([label, href, Icon]) => <Link key={href} href={href} className={`nav-link${pathname === href ? " nav-link--active" : ""}${mobile ? " nav-link--mobile" : ""}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></Link>)}
    </>
  );

  return <>
    <aside className="dashboard-sidebar">
      <Link href="/dashboard" className="sidebar-brand"><BrandLockup compact light /></Link>
      <p className="sidebar-label">WORKSPACE</p>
      <nav className="sidebar-links" aria-label="Main navigation">{linkItems()}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-profile">
        <div className="profile-monogram">{role === "super_admin" ? "MB" : role === "group_admin" ? "PB" : "TM"}</div>
        <div className="profile-copy">
          <strong>{getRoleDisplayName(role)}</strong>
          <span>{role === "super_admin" ? "Founder · Super Admin" : role === "group_admin" ? "Co-Founder · Group Admin" : "Employee"}</span>
        </div>
        <form action={signOutAction}><button className="signout-icon" type="submit" title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></form>
      </div>
      {role === "super_admin" && <div className="authority-note"><WalletCards size={15} /><span>Full Group Authority</span></div>}
      {role === "group_admin" && <div className="authority-note"><FileText size={15} /><span>Group-wide Administration</span></div>}
      <Link href="/dashboard" className="sidebar-footer"><span>Wealth · Growth · Protection</span><ArrowUpRight size={14} /></Link>
    </aside>
    <div className="mobile-topbar">
      <Link href="/dashboard"><BrandLockup compact /></Link>
      <details className="mobile-navigation">
        <summary aria-label="Open navigation"><span className="mobile-menu-lines"><i /><i /><i /></span></summary>
        <nav className="mobile-menu-items" aria-label="Mobile navigation">{linkItems(true)}<div className="mobile-menu-signout"><span>{getRoleDisplayName(role)} · {role === "super_admin" ? "Full Group Authority" : role === "group_admin" ? "Group-wide Administration" : "Employee"}</span><form action={signOutAction}><button type="submit">Sign out <LogOut size={15} /></button></form></div></nav>
      </details>
    </div>
  </>;
}
