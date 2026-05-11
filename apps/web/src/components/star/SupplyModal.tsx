// Supply / library checkout modal — pops on SUPPLY-* and BOOK-* scans.
//
// OUT scan: shows roster grid → tap kid to mark them as borrowing this
//           supply. For Book scans, shows a title input first.
// IN  scan: shows the active checkouts for this supply kind → tap to
//           mark returned. (Books listed individually since one kid
//           can have multiple checked out.)

import { useState } from "react";
import {
  StarStore,
  type StarStudent, type SupplyCheckout,
} from "../../lib/star/storage.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";
import { Modal } from "./ui.tsx";

type SupplyKind = SupplyCheckout["supplyKind"];

interface Props {
  supplyKind: SupplyKind;
  direction: "out" | "in";
  onClose: () => void;
}

const META: Record<SupplyKind, { icon: string; label: string }> = {
  Pencil:     { icon: "✏️", label: "Pencil" },
  Tablet:     { icon: "📱", label: "Tablet" },
  Headphones: { icon: "🎧", label: "Headphones" },
  Book:       { icon: "📚", label: "Book" },
};

export default function SupplyModal({ supplyKind, direction, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [checkouts, setCheckouts] = useState<SupplyCheckout[]>(() => StarStore.getSupplyCheckouts());
  const [bookTitle, setBookTitle] = useState("");

  const refresh = () => setCheckouts(StarStore.getSupplyCheckouts());
  const meta = META[supplyKind];

  const checkOut = (student: StarStudent) => {
    if (supplyKind === "Book" && !bookTitle.trim()) {
      errorBeep();
      alert("Type the book title first, then tap the student.");
      return;
    }
    if (supplyKind !== "Book") {
      const already = checkouts.find((c) => c.studentId === student.id && c.supplyKind === supplyKind);
      if (already) {
        errorBeep();
        return;
      }
    }
    const studentName = `${student.firstName} ${student.lastName}`.trim();
    StarStore.checkoutSupply({
      studentId: student.id,
      studentName,
      supplyKind,
      bookTitle: supplyKind === "Book" ? bookTitle.trim() : undefined,
    });
    setBookTitle("");
    refresh();
    successBeep();
    fireStarBoardEvent({
      kind: "supply-out" as any,
      studentName, studentId: student.id,
      detail: supplyKind === "Book" ? `${meta.icon} "${bookTitle.trim()}"` : `${meta.icon} ${meta.label}`,
    });
  };

  const checkIn = (c: SupplyCheckout) => {
    StarStore.returnSupply(c.id);
    refresh();
    loggedBeep();
    fireStarBoardEvent({
      kind: "supply-in" as any,
      studentName: c.studentName, studentId: c.studentId,
      detail: c.supplyKind === "Book" && c.bookTitle ? `${meta.icon} "${c.bookTitle}"` : `${meta.icon} ${meta.label}`,
    });
  };

  // Filter to JUST this supply kind
  const activeHere = checkouts.filter((c) => c.supplyKind === supplyKind);

  return (
    <Modal
      onClose={onClose}
      kicker={`${meta.icon} ${meta.label}`}
      title={direction === "out" ? `Borrow ${meta.label}` : `Return ${meta.label}`}
      width={560}
    >
      {direction === "out" ? (
        <>
          {supplyKind === "Book" && (
            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabel()}>Book title</div>
              <input
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
                placeholder="e.g. Charlotte's Web"
                autoFocus
                style={inp()}
              />
              <div style={{ marginTop: 4, fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>
                Type the book name, then tap the student who's borrowing it.
              </div>
            </div>
          )}

          {supplyKind !== "Book" && activeHere.length > 0 && (
            <div style={hint()}>
              Currently has it: <b>{activeHere.map((c) => c.studentName.split(" ")[0]).join(" · ")}</b>
            </div>
          )}

          <SectionPill icon="🎒">
            {supplyKind === "Book" ? "Pick the borrower" : "Tap the kid borrowing this"}
          </SectionPill>
          <div style={{ marginTop: 8, ...gridStyle() }}>
            {students.map((s) => {
              const onIt = supplyKind !== "Book" && checkouts.find((c) => c.studentId === s.id && c.supplyKind === supplyKind);
              return (
                <button
                  key={s.id}
                  onClick={() => checkOut(s)}
                  disabled={!!onIt}
                  style={tile(!!onIt)}
                >
                  {s.firstName}
                  {s.grade && <div style={subLabel()}>{s.grade}</div>}
                  {onIt && <div style={badgeOnIt()}>has it</div>}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {activeHere.length === 0 ? (
            <div style={empty()}>
              No {meta.label.toLowerCase()}s currently checked out. Scan {meta.icon} {meta.label}-OUT first.
            </div>
          ) : (
            <>
              <SectionPill icon="↩">Tap each item being returned</SectionPill>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {activeHere.map((c) => {
                  const elapsed = Math.max(0, Math.round((Date.now() - new Date(c.checkedOutAt).getTime()) / 60_000));
                  return (
                    <button
                      key={c.id}
                      onClick={() => checkIn(c)}
                      style={inRow()}
                    >
                      <div style={avatarStyle()}>{(c.studentName || "?").charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fce7f3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.studentName}{c.bookTitle ? ` — "${c.bookTitle}"` : ""}
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>
                          out for {elapsed === 0 ? "<1m" : elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`}
                        </div>
                      </div>
                      <div style={inBadge()}>Return</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>
        💡 Scan {meta.icon} {meta.label}-{direction === "out" ? "IN" : "OUT"} to {direction === "out" ? "mark returns" : "check more out"}.
      </div>
    </Modal>
  );
}

/* ── styling helpers ─────────────────────────────────────────────── */

function gridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
    gap: 8,
  };
}
function tile(disabled: boolean): React.CSSProperties {
  return {
    position: "relative",
    padding: "12px 8px", borderRadius: 12,
    background: disabled
      ? "rgba(168,85,247,0.06)"
      : "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
    border: disabled ? "1px solid rgba(168,85,247,0.18)" : "1px solid rgba(168,85,247,0.30)",
    color: disabled ? "rgba(196,181,253,0.45)" : "#fce7f3",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14, fontWeight: 800, minHeight: 64,
    touchAction: "manipulation",
  };
}
function subLabel(): React.CSSProperties {
  return { fontSize: 10, opacity: 0.65, marginTop: 3, fontWeight: 600 };
}
function badgeOnIt(): React.CSSProperties {
  return {
    fontSize: 9, marginTop: 4, color: "#f9a8d4", fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase",
  };
}
function inRow(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 14px", borderRadius: 12,
    background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.08))",
    border: "1px solid rgba(168,85,247,0.40)",
    color: "#fce7f3", cursor: "pointer", textAlign: "left",
    width: "100%", touchAction: "manipulation",
  };
}
function inBadge(): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
    color: "#86efac",
    padding: "4px 10px", borderRadius: 999,
    background: "rgba(16,185,129,0.18)",
    border: "1px solid rgba(16,185,129,0.45)",
  };
}
function avatarStyle(): React.CSSProperties {
  return {
    width: 38, height: 38, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: 16, color: "white", flexShrink: 0,
    boxShadow: "0 2px 8px -2px rgba(168,85,247,0.55)",
  };
}
function fieldLabel(): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
    color: "rgba(196,181,253,0.65)", marginBottom: 5,
  };
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 14, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}
function SectionPill({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "4px 12px", borderRadius: 999,
      background: "rgba(168,85,247,0.10)",
      border: "1px solid rgba(168,85,247,0.30)",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
      color: "#c4b5fd",
    }}>
      <span aria-hidden>{icon}</span>{children}
    </span>
  );
}
function hint(): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10, marginBottom: 12,
    background: "rgba(168,85,247,0.06)",
    border: "1px solid rgba(168,85,247,0.20)",
    color: "rgba(196,181,253,0.85)", fontSize: 12, fontWeight: 600,
  };
}
function empty(): React.CSSProperties {
  return {
    padding: "16px 18px", borderRadius: 12,
    background: "rgba(168,85,247,0.04)",
    border: "1px dashed rgba(168,85,247,0.25)",
    color: "rgba(196,181,253,0.65)", fontSize: 13, fontWeight: 600, textAlign: "center",
  };
}
