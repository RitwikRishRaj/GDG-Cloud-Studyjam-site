import Link from "next/link";
import { ClipboardList, MessageCircle } from "lucide-react";

type StudyMastheadProps = {
  page: "home" | "leaderboard";
};

export function StudyMasthead({ page }: StudyMastheadProps) {
  return (
    <header className="study-mast">
      <Link
        href="/"
        className="study-brand"
        aria-label="GDG on Campus KIIT Cloud Study Jam home"
      >
        <svg
          className="study-logo"
          viewBox="0 0 241.66 116.98"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            fill="#ea4335"
            d="M57.68,58.78l39.2-22.7c9.2-5.3,12.4-17.1,7.1-26.4s-17.1-12.4-26.4-7.1L9.78,41.68l47.9,17.1Z"
          />
          <path
            fill="#4285f4"
            d="M87.18,116.98c6.7,0,13.2-3.5,16.7-9.7,5.3-9.2,2.2-21-7.1-26.4L28.98,41.78c-9.2-5.3-21-2.2-26.4,7.1-5.3,9.2-2.2,21,7.1,26.4l67.8,39.1c3.1,1.7,6.5,2.6,9.7,2.6Z"
          />
          <path
            fill="#fbbc04"
            d="M154.68,116.98c3.3,0,6.6-.8,9.6-2.6l67.8-39.1-47.2-17.3-39.8,23c-9.2,5.3-12.4,17.1-7.1,26.4,3.5,6.1,10,9.6,16.7,9.6h0Z"
          />
          <path
            fill="#0f9d58"
            d="M222.38,77.78c6.7,0,13.2-3.5,16.7-9.6,5.3-9.2,2.2-21-7.1-26.4L164.28,2.68c-9.2-5.3-21-2.2-26.4,7.1-5.3,9.2-2.2,21,7.1,26.4l67.8,39.1c3,1.7,6.3,2.5,9.6,2.5Z"
          />
        </svg>
        <span className="study-brand-text">
          <strong>Google Developer Groups</strong>
          <span>On Campus · KIIT</span>
        </span>
      </Link>

      {page === "home" ? (
        <nav className="study-nav" aria-label="Page sections">
          <a
            href="https://goo.gle/lwc-student-curriculum"
            target="_blank"
            rel="noopener noreferrer"
          >
            Syllabus
          </a>
          <a href="#registration">
            <ClipboardList aria-hidden="true" />
            How to register
          </a>
          <a href="#help">
            <MessageCircle aria-hidden="true" />
            WhatsApp
          </a>
        </nav>
      ) : (
        <nav className="study-nav" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/leaderboard" aria-current="page">
            Leaderboard
          </Link>
          <Link href="/admin">Admin</Link>
        </nav>
      )}
    </header>
  );
}
