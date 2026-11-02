import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function Footer() {
  return (
    <footer className="study-footer">
      <p>
        <strong>GDG on Campus · KIIT</strong>
      </p>
      <p className="study-footer-small">
        Run by students, open to every branch, free since 2017.
      </p>
      <p className="study-local-links">
        <Link href="/#milestone-board">
          Milestone Board <ArrowUpRight aria-hidden="true" />
        </Link>
        <Link href="/admin">
          Admin <ArrowUpRight aria-hidden="true" />
        </Link>
      </p>
    </footer>
  );
}
