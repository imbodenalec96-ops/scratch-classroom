// Full-board birthday takeover. When today's Pacific date matches any
// student's birthday, this overlay slams in once on first board load
// of the day with confetti, balloons, and the kid's name across the
// whole screen. Kids only get one celebration per day per kid (gated
// by localStorage so closing+reopening the board doesn't replay it).

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

interface Student { id: string; name: string; avatar_emoji?: string | null; }

export default function BirthdayCelebration({ students }: { students: Student[] }) {
  const [birthdayKids, setBirthdayKids] = useState<Student[]>([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!students || students.length === 0) return;
    let cancelled = false;
    const todayPacific = (() => {
      const d = new Date(Date.now() - 7 * 3600_000);
      return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    })();
    (async () => {
      // Pull each kid's birthday in parallel; surface anyone whose
      // birthday is today AND we haven't celebrated yet today.
      const todays: Student[] = [];
      await Promise.all(students.map(async (s) => {
        try {
          const r = await api.getBirthday(s.id);
          if (r?.birthday && r.birthday.slice(-5) === todayPacific) {
            // localStorage gate so reloading the board doesn't replay
            const seenKey = `thign:bdayCelebrated:${s.id}:${todayPacific}`;
            if (!localStorage.getItem(seenKey)) {
              todays.push(s);
              localStorage.setItem(seenKey, "1");
            }
          }
        } catch { /* skip on failure */ }
      }));
      if (cancelled || todays.length === 0) return;
      setBirthdayKids(todays);
      setShow(true);
    })();
    return () => { cancelled = true; };
  }, [students.map((s) => s.id).join(",")]);

  // Auto-dismiss after 8 seconds, but tap-anywhere to dismiss earlier
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 8000);
    return () => clearTimeout(t);
  }, [show]);

  if (!show || birthdayKids.length === 0) return null;

  return (
    <div
      onClick={() => setShow(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "radial-gradient(ellipse at center, rgba(244,114,182,0.35) 0%, rgba(13,19,33,0.92) 70%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 18,
        animation: "bdayFadeIn .5s ease both",
        cursor: "pointer",
      }}
    >
      <style>{`
        @keyframes bdayFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bdayBounce {
          0%, 100% { transform: translateY(0) rotate(0); }
          25%      { transform: translateY(-22px) rotate(-3deg); }
          50%      { transform: translateY(-12px) rotate(2deg); }
          75%      { transform: translateY(-22px) rotate(-2deg); }
        }
        @keyframes bdayConfetti {
          0%   { transform: translate(0, -100vh) rotate(0); opacity: 1; }
          100% { transform: translate(var(--cx, 0), 100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes bdayBalloon {
          0%   { transform: translate(0, 110vh) rotate(-5deg); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translate(var(--bx, 0), -25vh) rotate(8deg); opacity: 0.8; }
        }
        @keyframes bdayName {
          0%   { transform: scale(0.4) rotate(-10deg); opacity: 0; }
          50%  { transform: scale(1.15) rotate(2deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
      `}</style>

      {/* Confetti — 60 little squares falling from the top */}
      {Array.from({ length: 60 }, (_, i) => {
        const colors = ["#f472b6", "#facc15", "#34d399", "#60a5fa", "#a78bfa", "#fb923c"];
        const left = Math.random() * 100;
        const cx = (Math.random() - 0.5) * 200;
        const delay = Math.random() * 1.5;
        const duration = 2.5 + Math.random() * 2;
        return (
          <span key={i} style={{
            position: "absolute",
            top: 0, left: `${left}%`,
            width: 10, height: 14,
            background: colors[i % colors.length],
            ["--cx" as any]: `${cx}px`,
            animation: `bdayConfetti ${duration}s linear ${delay}s infinite`,
            opacity: 0,
          } as React.CSSProperties} />
        );
      })}

      {/* Balloons rising from the bottom */}
      {Array.from({ length: 12 }, (_, i) => {
        const balloons = ["🎈", "🎉", "🎂", "🍰", "🎁"];
        const left = (i / 11) * 100;
        const bx = (Math.random() - 0.5) * 60;
        const delay = Math.random() * 2;
        const duration = 6 + Math.random() * 3;
        return (
          <span key={i} style={{
            position: "absolute",
            bottom: 0, left: `${left}%`,
            fontSize: 48,
            ["--bx" as any]: `${bx}px`,
            animation: `bdayBalloon ${duration}s ease-out ${delay}s infinite`,
            opacity: 0,
          } as React.CSSProperties}>{balloons[i % balloons.length]}</span>
        );
      })}

      {/* Cake + kid's name */}
      <div style={{
        fontSize: 120, lineHeight: 1,
        animation: "bdayBounce 1.4s ease-in-out infinite",
        filter: "drop-shadow(0 0 20px rgba(251,191,36,0.6))",
      }}>🎂</div>
      <div style={{
        fontSize: 28, fontWeight: 800,
        letterSpacing: "0.18em", textTransform: "uppercase",
        color: "#fde68a",
        textShadow: "0 0 14px rgba(251,191,36,0.7)",
        animation: "bdayFadeIn 1s ease 0.2s both",
      }}>Happy Birthday</div>
      <div style={{
        fontSize: "min(20vw, 220px)", lineHeight: 1,
        fontWeight: 900, letterSpacing: "-0.02em",
        background: "linear-gradient(135deg, #f472b6 0%, #fde68a 50%, #60a5fa 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        textAlign: "center",
        animation: "bdayName 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        textShadow: "0 0 30px rgba(244,114,182,0.5)",
      }}>{birthdayKids.map((k) => k.name.split(" ")[0]).join(" & ")}</div>
      <div style={{
        marginTop: 18,
        fontSize: 14, fontWeight: 700,
        color: "rgba(245,241,232,0.65)",
        letterSpacing: "0.10em",
        animation: "bdayFadeIn 1s ease 1.2s both",
      }}>Tap anywhere to dismiss</div>
    </div>
  );
}
