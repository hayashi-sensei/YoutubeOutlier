import { AppShell } from "@/components/app-shell/app-shell";

export default function LoggedInLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
