import { useEffect, useState } from "react";
import { Check, X, Star } from "lucide-react";

type Stage = 0 | 1 | 2; // Not Verified, Skill Passport, Hired

export default function VerificationStagesCard() {
  const [current, setCurrent] = useState<Stage>(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (current < 2) {
      timeoutId = setTimeout(() => setCurrent((c) => (c + 1) as Stage), 3000);
    } else {
      timeoutId = setTimeout(() => setCurrent(0), 4000);
    }
    return () => clearTimeout(timeoutId);
  }, [current]);

  return (
    <div className="verification-stages-wrap">
      {/* Step indicators: Not Verified | Skill Passport | Hire */}
      <div className="vs-steps">
        <div className={`vs-step-item ${current === 0 ? "active" : current > 0 ? "done" : ""}`}>
          <div className="vs-step-dot">
            {current > 0 ? <Check className="w-3 h-3" strokeWidth={3} /> : "1"}
          </div>
          <span>Not Verified</span>
        </div>
        <div className="vs-step-line">
          <div
            className="vs-step-line-fill"
            style={{ width: current >= 1 ? "100%" : "0%" }}
          />
        </div>
        <div className={`vs-step-item ${current === 1 ? "active" : current > 1 ? "done" : ""}`}>
          <div className="vs-step-dot">
            {current > 1 ? <Check className="w-3 h-3" strokeWidth={3} /> : "2"}
          </div>
          <span>Skill Passport</span>
        </div>
        <div className="vs-step-line">
          <div
            className="vs-step-line-fill"
            style={{ width: current >= 2 ? "100%" : "0%" }}
          />
        </div>
        <div className={`vs-step-item ${current === 2 ? "active" : ""}`}>
          <div className="vs-step-dot">{current === 2 ? "3" : "3"}</div>
          <span>Hire</span>
        </div>
      </div>

      {/* Card stage */}
      <div className="vs-stage">
        {/* CARD 1 — Not Verified */}
        <div
          className={`vs-card vs-card-1 ${current === 0 ? "active" : ""} ${current > 0 ? "exit" : ""}`}
        >
          <div className="vs-pill vs-pill-red">
            <span className="vs-pill-dot" />
            Not Verified
          </div>
          <div className="vs-person-row">
            <div className="vs-avatar vs-avatar-gray relative">
              <span>RS</span>
              <div className="vs-av-ring vs-ring-red" />
              <div className="vs-av-badge vs-badge-x">
                <X className="w-2.5 h-2.5" strokeWidth={3} />
              </div>
            </div>
            <div>
              <div className="vs-p-name">Rahul Sharma</div>
              <div className="vs-p-role">Full Stack Developer</div>
              <div className="vs-p-college">NIT Trichy · 2 yrs exp</div>
            </div>
          </div>
          <div className="vs-track">
            {["Profile", "Aptitude", "DSA", "AI Round", "Expert"].map((label) => (
              <div key={label} className="vs-tn">
                <div className="vs-tdot vs-dot-red">—</div>
                <div className="vs-tlabel">{label}</div>
              </div>
            ))}
          </div>
          <div className="vs-locked">
            <div className="vs-scores">
              {[
                { lbl: "Technical Depth", val: "—" },
                { lbl: "DSA Round", val: "—" },
                { lbl: "Problem Solving", val: "—" },
              ].map((s, i) => (
                <div key={i} className="vs-srow">
                  <div className="vs-smeta">
                    <span className="vs-slbl">{s.lbl}</span>
                    <span className="vs-sval">{s.val}</span>
                  </div>
                  <div className="vs-sbar">
                    <div className="vs-sfill vs-sfill-red" style={{ width: "5%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="vs-pf">
            <div>
              <div className="vs-pf-lbl">Skill Passport</div>
              <div className="vs-pf-id">Not Issued</div>
            </div>
            <div className="vs-pf-badge vs-badge-none">?</div>
          </div>
        </div>

        {/* CARD 2 — Skill Passport */}
        <div
          className={`vs-card vs-card-2 ${current === 1 ? "active" : ""} ${current > 1 ? "exit" : ""}`}
        >
          <div className="vs-pill vs-pill-gold">
            <span className="vs-pill-dot vs-pd-gold" />
            Skill Passport Issued
          </div>
          <div className="vs-person-row">
            <div className="vs-avatar vs-avatar-purple relative">
              <span>RS</span>
              <div className="vs-av-ring vs-ring-gold" />
              <div className="vs-av-badge vs-badge-check">
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              </div>
            </div>
            <div>
              <div className="vs-p-name">Rahul Sharma</div>
              <div className="vs-p-role">Full Stack Developer</div>
              <div className="vs-p-college">NIT Trichy · 2 yrs exp</div>
            </div>
          </div>
          <div className="vs-track">
            {["Profile", "Aptitude", "DSA", "AI Round", "Expert"].map((label) => (
              <div key={label} className="vs-tn vs-conn-gold">
                <div className="vs-tdot vs-dot-gold">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </div>
                <div className="vs-tlabel vs-lbl-gold">{label}</div>
              </div>
            ))}
          </div>
          <div className="vs-scores">
            {[
              { lbl: "Technical Depth", val: "92%", w: 92, cls: "vs-sf-gold1" },
              { lbl: "DSA Round", val: "87%", w: 87, cls: "vs-sf-gold2" },
              { lbl: "Problem Solving", val: "89%", w: 89, cls: "vs-sf-gold3" },
            ].map((s, i) => (
              <div key={i} className="vs-srow">
                <div className="vs-smeta">
                  <span className="vs-slbl">{s.lbl}</span>
                  <span className="vs-sval">{s.val}</span>
                </div>
                <div className="vs-sbar">
                  <div
                    className={`vs-sfill vs-sfill-grow ${s.cls}`}
                    style={{ width: current === 1 ? `${s.w}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="vs-pf">
            <div>
              <div className="vs-pf-lbl">Skill Passport</div>
              <div className="vs-pf-id">PH-EV-2026-48291</div>
            </div>
            <div className="vs-pf-badge vs-badge-gold">A</div>
          </div>
        </div>

        {/* CARD 3 — Hired */}
        <div className={`vs-card vs-card-3 ${current === 2 ? "active" : ""}`}>
          <div className="vs-pill vs-pill-green">
            <span className="vs-pill-dot vs-pd-green" />
            Hired · Screening Skipped
          </div>
          <div className="vs-person-row">
            <div className="vs-avatar vs-avatar-purple relative">
              <span>RS</span>
              <div className="vs-av-ring vs-ring-green" />
              <div className="vs-av-badge vs-badge-star">
                <Star className="w-2.5 h-2.5" fill="currentColor" />
              </div>
            </div>
            <div>
              <div className="vs-p-name">Rahul Sharma</div>
              <div className="vs-p-role">Full Stack Developer</div>
              <div className="vs-p-college">NIT Trichy · 2 yrs exp</div>
            </div>
          </div>
          <div className="vs-hired-banner">
            <div className="vs-hb-logo">🏢</div>
            <div>
              <div className="vs-hb-name">Razorpay — Bengaluru</div>
              <div className="vs-hb-sub">Frontend Engineer · 22 LPA · Full-time</div>
            </div>
            <div className="vs-hb-chip">Hired ✓</div>
          </div>
          <div className="vs-track">
            {["Profile", "Aptitude", "DSA", "AI Round", "Expert"].map((label) => (
              <div key={label} className="vs-tn vs-conn-green">
                <div className="vs-tdot vs-dot-green">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </div>
                <div className="vs-tlabel vs-lbl-green">{label}</div>
              </div>
            ))}
          </div>
          <div className="vs-scores">
            {[
              { lbl: "Technical Depth", val: "92%", w: 92, cls: "vs-sf-gold1" },
              { lbl: "DSA Round", val: "87%", w: 87, cls: "vs-sf-gold2" },
              { lbl: "Problem Solving", val: "89%", w: 89, cls: "vs-sf-gold3" },
            ].map((s, i) => (
              <div key={i} className="vs-srow">
                <div className="vs-smeta">
                  <span className="vs-slbl">{s.lbl}</span>
                  <span className="vs-sval">{s.val}</span>
                </div>
                <div className="vs-sbar">
                  <div className={`vs-sfill ${s.cls}`} style={{ width: `${s.w}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="vs-pf">
            <div>
              <div className="vs-pf-lbl">Skill Passport</div>
              <div className="vs-pf-id">PH-EV-2026-48291</div>
            </div>
            <div className="vs-pf-badge vs-badge-green">
              <Check className="w-4 h-4" strokeWidth={3} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
