import Link from "next/link";
import { ArrowRight, ArrowUpRight, ClipboardList, MessageCircle } from "lucide-react";
import { CopyReferralButton } from "@/components/copy-referral";
import { StudyMasthead } from "@/components/study-masthead";
import { MilestoneBoard, MilestoneStats } from "@/components/leaderboard";
import { MilestoneCountdown } from "@/components/milestone-countdown";
import milestoneStyles from "@/components/milestone-board.module.css";
import { getMilestoneData } from "@/lib/milestone-data";
import { CAMPAIGN_DEADLINE } from "@/lib/campaign";

const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLScIxD14Pyc183PbDLHcS9N-nbQRRYSncqY0TP3g7qSsfWgnKQ/viewform";
const syllabusUrl = "https://goo.gle/lwc-student-curriculum";
const guideUrl = "https://docs.google.com/document/d/1_V1v-Ii9QBzF9bTK_InE4670H12n5Te36DTjuEoz9gs/edit?tab=t.0#heading=h.e1a2o8y6pljb";
const whatsappUrl = "https://chat.whatsapp.com/CHeebKrkCyv89bXo64vBS3";

function ArrowCircle({ className = "" }: { className?: string }) {
  return <span className={`go ${className}`} aria-hidden="true"><ArrowRight /></span>;
}

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const milestoneData = await getMilestoneData();

  return (
    <div className="study-site">
      <div className="study-wrap">
        <StudyMasthead page="home" />

        <main className="study-content">
          <section className="study-hero" aria-labelledby="hero-title">
            <span className="study-dots study-dots-blue" aria-hidden="true" />
            <span className="study-dots study-dots-green" aria-hidden="true" />
            <span className="study-mono">Google Cloud · Learn with Communities</span>
            <h1 id="hero-title">Cloud Study Jam</h1>
            <div className="study-badges">
              <span className="study-year">2026</span>
              <div className="study-tagline" aria-label="Learn, build, earn">
                <span>LEARN.</span><span>BUILD.</span><span>EARN.</span>
              </div>
            </div>
            <p className="study-lead">Do free, hands-on Google Cloud labs on Google Skills. <strong>5 skill badges</strong> get you a Google Cloud water bottle. <strong>10</strong> unlock an exclusive developer kit with a T-shirt. Every badge also goes on your resume and LinkedIn.</p>
            <div className="study-actions">
              <div className="study-cta-block">
                <div className="study-notice"><span className="study-bang" aria-hidden="true">!</span><p><strong>Read the <a href="#registration">guide</a> first. It is important.</strong> Most rejected applications come from a skipped step.</p></div>
                <div className="study-cta-row">
                  <a className="study-cta study-primary" href={formUrl} target="_blank" rel="noopener noreferrer">Register now <ArrowCircle /></a>
                  <a className="study-cta study-secondary" href="#registration">Read the guide <ArrowCircle /></a>
                </div>
                <p className="study-deadline"><span className="study-deadline-dot" aria-hidden="true" /><strong>Registration closes 27 Oct, 11:59 PM IST</strong></p>
              </div>
              <div className="study-ticket">
                <div className="study-ticket-main"><span className="study-mono">Referral code</span><span className="study-ticket-code">GDGC-KIIT1</span><span className="study-ticket-note">Enter it on the form to count for KIIT.</span></div>
                <CopyReferralButton className="study-ticket-copy" />
              </div>
            </div>
          </section>

          <section id="milestone-board" className={milestoneStyles.section} aria-labelledby="milestone-title">
            <div className={milestoneStyles.countdownHeader}>
              <span className="study-mono">Campaign deadline</span>
              <h2 id="milestone-title" className={milestoneStyles.countdownHeading}>Milestone Board</h2>
              <p className={milestoneStyles.deadline}>{CAMPAIGN_DEADLINE.label}</p>
              <MilestoneCountdown />
            </div>
            <div className={milestoneStyles.curriculumLink}>
              <a className="study-cta study-secondary" href={syllabusUrl} target="_blank" rel="noopener noreferrer">
                Open curriculum <ArrowCircle />
              </a>
            </div>
            {milestoneData ? (
              <MilestoneStats stats={milestoneData.stats} />
            ) : (
              <p role="status">Progress statistics are temporarily unavailable.</p>
            )}
            <section aria-labelledby="board-table-title">
              <div className="study-section-title">
                <span className="study-mono">Progress by milestone</span>
                <h3 id="board-table-title">Participants who reached a milestone.</h3>
                <p>Ranked by the highest milestone reached and the date it was earned.</p>
              </div>
              {milestoneData ? (
                <MilestoneBoard rows={milestoneData.rows} lastUpdated={milestoneData.stats.last_updated} />
              ) : (
                <div className="study-empty" role="status"><p>The Milestone Board is temporarily unavailable.</p></div>
              )}
              <p className={milestoneStyles.footnote}>
                Provisional progress guide only. Rewards are limited and final eligibility is determined by Google’s campaign rules; this is not the official result.
              </p>
            </section>
          </section>

          <section id="syllabus" aria-labelledby="syllabus-title">
            <div className="study-section-title"><span className="study-mono">Start here</span><h2 id="syllabus-title">Follow the syllabus.</h2><p>See the full Google Cloud learning path and the labs you can complete during the Study Jam.</p></div>
            <div className="study-syllabus-card">
              <div><h2>Google Cloud student curriculum</h2><p>Open the official curriculum to see the recommended order, lab topics, and badge requirements.</p></div>
              <a className="study-cta study-secondary" href={syllabusUrl} target="_blank" rel="noopener noreferrer">Open syllabus <ArrowCircle /></a>
            </div>
            <div className="study-credit-card">
              <h3>Redeem Your 200 Free Credits</h3>
              <ol>
                <li>Check your inbox for <strong>“Congratulations! You are now enrolled.”</strong></li>
                <li>Open the email link in an Incognito window and enter your unique access code.</li>
                <li>Sign in and complete <strong>“A Tour of Google Cloud Hands-on Labs”</strong> for at least 6 minutes with a score of 100.</li>
                <li>Click <strong>End Lab</strong> and wait 20–30 minutes for your 200 credits.</li>
              </ol>
              <p className="study-disclaimer"><strong>Haven’t received your email within 2 days of registration or facing issues?</strong> Please wait at least 2 days before contacting the organisers or emailing <a href="mailto:learnwithcommunities-support@google.com">learnwithcommunities-support@google.com</a>.</p>
            </div>
          </section>

          <section id="registration" aria-labelledby="how-title">
            <details className="study-collapsible">
              <summary className="study-section-title study-summary">
                <svg className="study-wave" viewBox="0 0 250 56" aria-hidden="true"><path d="M3 38c26-26 41-26 64 0s38 26 62 0 40-26 64 0 37 23 54-1" /></svg>
                <span className="study-mono">Registration guide</span>
                <h2 id="how-title">Register in three steps.</h2>
                <p>Do them in order. Skipping one is the usual reason an application gets rejected.</p>
                <span className="study-summary-cue">Click to open the steps</span>
              </summary>
              <div className="study-steps">
                <article className="study-step study-step-one">
                  <div className="study-step-head"><span className="study-num">1</span><h3>Make a brand-new Google account</h3></div>
                  <p className="study-sub">Not your personal, college or old account. This one is only for Google Skills and the form.</p>
                  <ul>
                    <li>Open an <strong>Incognito</strong> window in Chrome.</li>
                    <li>Go to <a href="https://accounts.google.com/signup" target="_blank" rel="noopener noreferrer"><code>accounts.google.com/signup</code></a> and follow the prompts.</li>
                    <li><strong>Save the new email and password</strong> somewhere safe.</li>
                  </ul>
                  <div className="study-alert"><span className="study-alert-label">Must be new</span>Created on or after <strong>14 Sept 2026</strong>. An older account gets rejected.</div>
                </article>
                <article className="study-step study-step-two">
                  <div className="study-step-head"><span className="study-num">2</span><h3>Make your Skills profile public</h3></div>
                  <p className="study-sub">Sign in at <a href="https://www.skills.google/" target="_blank" rel="noopener noreferrer"><code>skills.google</code></a> with the new account.</p>
                  <ul>
                    <li>Profile icon <strong>→ Settings → Account → Public visibility</strong>.</li>
                    <li>Tick <strong>Make profile public</strong>, then <strong>Update settings</strong>.</li>
                    <li><strong>Copy the link</strong> in the green box and save it. It looks like <code>skills.google/public_profiles/…</code></li>
                  </ul>
                  <div className="study-alert"><span className="study-alert-label">No green box?</span>The profile is not public yet. Press Update settings again.</div>
                </article>
                <article className="study-step study-step-three">
                  <div className="study-step-head"><span className="study-num">3</span><h3>Fill in the registration form</h3></div>
                  <p className="study-sub">Use a laptop, signed in with the new account, with Google Skills open in another tab. The form asks for these, in this order.</p>
                  <div className="study-cta-row"><a className="study-cta study-primary" href={formUrl} target="_blank" rel="noopener noreferrer">Open the form <ArrowCircle /></a></div>
                  <div className="study-form-window"><dl>
                    <div className="study-form-row"><dt>Email</dt><dd>The new account. Use <strong>Switch account</strong> if the form shows another.</dd></div>
                    <div className="study-form-row"><dt>Terms</dt><dd><strong>Yes, I accept the terms</strong><small>Declining means no Google Skills access code.</small></dd></div>
                    <div className="study-form-row"><dt>Your details</dt><dd>Full name as on your ID, gender, learner category.</dd></div>
                    <div className="study-form-row"><dt>Organiser</dt><dd><strong>GDG on Campus Organiser</strong></dd></div>
                    <div className="study-form-row study-form-key"><dt>Referral code</dt><dd><span className="study-answer"><strong>GDGC-KIIT1</strong><CopyReferralButton className="study-copy-pill" /></span><small>Type it exactly. It credits your registration to KIIT.</small></dd></div>
                    <div className="study-form-row"><dt>Laptop + internet</dt><dd><strong>Yes</strong></dd></div>
                    <div className="study-form-row"><dt>Skills account</dt><dd>Tick <strong>I verify</strong>, then enter the same new email again.</dd></div>
                    <div className="study-form-row study-form-key"><dt>Profile URL</dt><dd>Paste <strong>your own</strong> link from Step 2, never the sample. Open it in a new tab to check it loads.</dd></div>
                    <div className="study-form-row"><dt>Last page</dt><dd>Tick <strong>I Acknowledge</strong> and <strong>Yes, I Agree</strong>, then press <strong>Submit once</strong>.</dd></div>
                  </dl></div>
                  <p className="study-jump">After the profile URL the form may jump straight to the last page. That is normal.</p>
                  <div className="study-alert study-alert-rejected"><span className="study-alert-label">Rejected if</span><ul>
                    <li>The email differs between the form and Google Skills.</li>
                    <li>The profile is private, or the sample link is pasted.</li>
                    <li>The referral code is missing or wrong.</li>
                    <li>You submit twice. Earlier entries are deleted and you can lose progress.</li>
                  </ul></div>
                </article>
              </div>
            </details>
          </section>

          <section className="study-important" aria-labelledby="important-title">
            <h2 id="important-title">Important:</h2>
            <ul><li>All badges in the official syllabus are mandatory.</li><li>Only listed badges count.</li><li className="study-important-deadline">Deadline: 23rd November (no extensions!)</li></ul>
          </section>

          <section id="help" className="study-help" aria-labelledby="help-title">
            <div className="study-after"><span className="study-mono">After you submit</span><p>A copy of your response lands in your inbox. Once your registration is confirmed, the campaign says the Google Cloud team emails you an <strong>access code</strong> for free lab credits. Submitting does not guarantee a place.</p></div>
            <div className="study-help-banner">
              <span className="study-help-icon"><MessageCircle aria-hidden="true" /></span>
              <div><h2 id="help-title">Stuck? Ask us in the WhatsApp group.</h2><p>Post your question and an organiser from <strong>GDG on Campus KIIT</strong> will answer.</p></div>
              <a className="study-cta study-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Join the group <ArrowCircle /></a>
            </div>
            <div className="study-help-banner study-doc-banner">
              <span className="study-help-icon"><ClipboardList aria-hidden="true" /></span>
              <div><h2>Prefer the full guide?</h2><p>The original doc shows a screenshot of every step, if you would rather follow along visually.</p></div>
              <a className="study-cta study-secondary" href={guideUrl} target="_blank" rel="noopener noreferrer">Open the doc <ArrowCircle /></a>
            </div>
          </section>

          <footer className="study-footer">
            <p><strong>GDG on Campus · KIIT</strong></p>
            <p className="study-footer-small">Run by students, open to every branch, free since 2017.</p>
            <p className="study-local-links"><Link href="/leaderboard">Badge leaderboard <ArrowUpRight aria-hidden="true" /></Link><Link href="/admin">Admin <ArrowUpRight aria-hidden="true" /></Link></p>
          </footer>
        </main>
      </div>
    </div>
  );
}
