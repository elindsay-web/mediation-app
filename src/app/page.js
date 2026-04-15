"use client";
// src/app/page.js
//
// Main mediation interface. Uses:
//   - Firebase Realtime Database for shared room state (instant sync)
//   - /api/mediate route for secure Anthropic API calls

import { useState, useRef, useEffect } from "react";
import {
  createRoom,
  getRoom,
  onRoomChange,
  claimRole,
  addMessage,
  setProcessing,
  resetRoom,
} from "@/lib/firebase";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */

const ROLES = {
  plaintiff: {
    id: "plaintiff",
    label: "Plaintiff's Counsel",
    party: "Taylor Morgan",
    color: "#1B4965",
    desc: "Represent Taylor Morgan, alleging race discrimination and retaliation under Title VII and §1981.",
  },
  defendant: {
    id: "defendant",
    label: "Defense Counsel",
    party: "NexaGen Therapeutics",
    color: "#7B2D26",
    desc: "Represent NexaGen Therapeutics, defending against claims of discrimination and retaliation.",
  },
};

function genCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

/* ═══════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════ */

function Dots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "6px 0", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: "50%", background: "#8B7355",
            animation: `dotPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes dotPulse{0%,80%,100%{transform:scale(.7);opacity:.35}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

function StatusDot({ active }) {
  return (
    <span
      style={{
        display: "inline-block", width: 8, height: 8, borderRadius: "50%",
        background: active ? "#4ADE80" : "#D1D5DB",
        boxShadow: active ? "0 0 6px #4ADE8088" : "none",
        marginRight: 6, verticalAlign: "middle",
      }}
    />
  );
}

/* ═══════════════════════════════════════════
   API HELPER
   ═══════════════════════════════════════════ */

async function callMediator(messages) {
  const res = await fetch("/api/mediate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data.reply;
}

/** Convert room messages to Anthropic API message format */
function buildApiMessages(msgs) {
  const api = [];
  let pendingUser = [];

  for (const m of msgs) {
    if (m.sender === "mediator") {
      if (pendingUser.length) {
        api.push({ role: "user", content: pendingUser.join("\n\n") });
        pendingUser = [];
      }
      api.push({ role: "assistant", content: m.content });
    } else {
      const label = ROLES[m.sender]?.label || m.sender;
      pendingUser.push(`[${label}]: ${m.content}`);
    }
  }
  if (pendingUser.length) {
    api.push({ role: "user", content: pendingUser.join("\n\n") });
  }
  if (api.length === 0 || api[0].role !== "user") {
    api.unshift({
      role: "user",
      content: "[System]: The mediation session is in progress.",
    });
  }
  return api;
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

export default function MediationPage() {
  const [screen, setScreen] = useState("lobby"); // lobby | role-select | chat
  const [roomCode, setRoomCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [myRole, setMyRole] = useState(null);
  const [room, setRoom] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const chatEnd = useRef(null);
  const inputRef = useRef(null);
  const lastMsgCount = useRef(0);
  const openingTriggered = useRef(false);

  // ── Firebase real-time listener ──
  useEffect(() => {
    if (!roomCode || screen !== "chat") return;
    const unsub = onRoomChange(roomCode, (data) => {
      if (data) setRoom(data);
    });
    return unsub;
  }, [roomCode, screen]);

  // ── Also listen during role-select so we see when roles are claimed ──
  useEffect(() => {
    if (!roomCode || screen !== "role-select") return;
    const unsub = onRoomChange(roomCode, (data) => {
      if (data) setRoom(data);
    });
    return unsub;
  }, [roomCode, screen]);

  // ── Auto-scroll ──
  useEffect(() => {
    const msgs = room?.messages || [];
    const count = Array.isArray(msgs) ? msgs.length : 0;
    if (count > lastMsgCount.current) {
      chatEnd.current?.scrollIntoView({ behavior: "smooth" });
      lastMsgCount.current = count;
    }
  }, [room?.messages]);

  // ── Focus input ──
  useEffect(() => {
    if (screen === "chat" && !sending) inputRef.current?.focus();
  }, [screen, sending, room?.messages]);

  // ── Trigger mediator opening when both join ──
  useEffect(() => {
    if (!room || !roomCode || screen !== "chat") return;
    const bothJoined = room.roles?.plaintiff && room.roles?.defendant;
    const msgs = room.messages || [];
    const hasMessages = Array.isArray(msgs) && msgs.length > 0;
    if (bothJoined && !hasMessages && !room.processing && !openingTriggered.current) {
      openingTriggered.current = true;
      triggerMediatorOpening();
    }
  }, [room?.roles?.plaintiff, room?.roles?.defendant, screen]);

  async function triggerMediatorOpening() {
    try {
      await setProcessing(roomCode, true);
      const reply = await callMediator([
        {
          role: "user",
          content:
            "Both parties have joined the mediation session. Please deliver your opening welcome, explain the ground rules, and invite opening statements.",
        },
      ]);
      await addMessage(roomCode, "mediator", reply);
      await setProcessing(roomCode, false);
    } catch (e) {
      await setProcessing(roomCode, false);
      setError(e.message);
    }
  }

  // ── Handlers ──

  async function handleCreateRoom() {
    const code = genCode();
    try {
      await createRoom(code);
      setRoomCode(code);
      setRoom({
        roles: { plaintiff: false, defendant: false },
        messages: [],
        processing: false,
      });
      setScreen("role-select");
      setError(null);
    } catch (e) {
      setError("Failed to create room. Check your Firebase configuration.");
    }
  }

  async function handleJoinRoom() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    try {
      const data = await getRoom(code);
      if (!data) {
        setError("Room not found. Check the code and try again.");
        return;
      }
      setRoomCode(code);
      setRoom(data);
      setScreen("role-select");
      setError(null);
    } catch (e) {
      setError("Error joining room. Check your connection.");
    }
  }

  async function handleSelectRole(roleId) {
    try {
      await claimRole(roomCode, roleId);
      setMyRole(roleId);
      openingTriggered.current = false;
      setScreen("chat");
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSend(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");
    setError(null);

    try {
      await addMessage(roomCode, myRole, text);
      await setProcessing(roomCode, true);

      // Re-read room to get latest messages
      const current = await getRoom(roomCode);
      const msgs = current?.messages || [];
      const apiMsgs = buildApiMessages(msgs);
      const reply = await callMediator(apiMsgs);

      await addMessage(roomCode, "mediator", reply);
      await setProcessing(roomCode, false);
    } catch (e) {
      setError(e.message);
      await setProcessing(roomCode, false).catch(() => {});
    } finally {
      setSending(false);
    }
  }

  async function handleReset() {
    if (!window.confirm("Reset this session? All messages will be cleared.")) return;
    try {
      await resetRoom(roomCode);
    } catch {}
    setRoom(null);
    setMyRole(null);
    setRoomCode("");
    setScreen("lobby");
    lastMsgCount.current = 0;
    openingTriggered.current = false;
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  /* ─── STYLE TOKENS ─── */
  const font = "'Libre Baskerville', Georgia, serif";
  const sans = "'DM Sans', 'Helvetica Neue', sans-serif";
  const mono = "'DM Mono', monospace";
  const bg = "#F6F3ED";
  const card = "#FFFEF9";
  const border = "#DDD6C8";
  const muted = "#8A7E6B";
  const dark = "#2A2318";
  const gold = "#96845B";

  /* ═══════════════════════════════════════════
     LOBBY
     ═══════════════════════════════════════════ */
  if (screen === "lobby") {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font, padding: 20 }}>
        <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: 5, textTransform: "uppercase", color: gold, marginBottom: 20, fontFamily: sans, fontWeight: 700 }}>
            Multi-Party AI Mediation
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 400, color: dark, margin: "0 0 8px", lineHeight: 1.25 }}>
            Morgan v. NexaGen Therapeutics
          </h1>
          <div style={{ fontSize: 13, color: muted, fontFamily: sans, marginBottom: 40 }}>
            Civil Action No. 3:26-cv-198-EKL-HLL — S.D. Mississippi
          </div>

          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
            <div style={{ flex: "1 1 240px", maxWidth: 260, background: card, border: `1px solid ${border}`, borderRadius: 6, padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: gold, fontFamily: sans, fontWeight: 700, marginBottom: 12 }}>Start a Session</div>
              <p style={{ fontSize: 13, color: muted, fontFamily: sans, lineHeight: 1.6, marginBottom: 20 }}>Create a new mediation room and share the code with your counterpart.</p>
              <button onClick={handleCreateRoom} style={{ width: "100%", padding: "11px 0", background: dark, color: "#FFF", border: "none", borderRadius: 4, fontSize: 12, fontFamily: sans, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer" }}>
                Create Room
              </button>
            </div>

            <div style={{ flex: "1 1 240px", maxWidth: 260, background: card, border: `1px solid ${border}`, borderRadius: 6, padding: "28px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: gold, fontFamily: sans, fontWeight: 700, marginBottom: 12 }}>Join a Session</div>
              <p style={{ fontSize: 13, color: muted, fontFamily: sans, lineHeight: 1.6, marginBottom: 16 }}>Enter the 5-letter room code provided by the other party.</p>
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 5))}
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                placeholder="XXXXX"
                maxLength={5}
                style={{ width: "100%", padding: "10px 0", textAlign: "center", border: `1px solid ${border}`, borderRadius: 4, fontSize: 18, fontFamily: mono, letterSpacing: 6, color: dark, background: "#FFF", marginBottom: 12, outline: "none", boxSizing: "border-box" }}
              />
              <button onClick={handleJoinRoom} disabled={codeInput.trim().length < 5} style={{ width: "100%", padding: "11px 0", background: codeInput.trim().length < 5 ? "#D1CCBF" : dark, color: "#FFF", border: "none", borderRadius: 4, fontSize: 12, fontFamily: sans, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", cursor: codeInput.trim().length < 5 ? "default" : "pointer" }}>
                Join Room
              </button>
            </div>
          </div>

          {error && <div style={{ marginTop: 20, padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, fontSize: 13, color: "#991B1B", fontFamily: sans }}>{error}</div>}

          <div style={{ marginTop: 40, padding: "14px 20px", background: "#EEEADF", borderRadius: 4, border: `1px solid ${border}` }}>
            <p style={{ fontSize: 12, color: muted, lineHeight: 1.6, margin: 0, fontFamily: sans }}>
              <strong style={{ color: dark }}>How it works:</strong> One student creates a room and shares the code. The other joins with that code. Each picks a role — Plaintiff&apos;s or Defense Counsel. The AI mediator facilitates between you in a shared conversation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     ROLE SELECT
     ═══════════════════════════════════════════ */
  if (screen === "role-select") {
    const pTaken = room?.roles?.plaintiff;
    const dTaken = room?.roles?.defendant;

    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font, padding: 20 }}>
        <div style={{ maxWidth: 560, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: 5, textTransform: "uppercase", color: gold, marginBottom: 16, fontFamily: sans, fontWeight: 700 }}>Room Code</div>
          <div onClick={copyCode} style={{ display: "inline-block", fontSize: 32, fontFamily: mono, letterSpacing: 8, color: dark, background: card, border: `2px dashed ${gold}`, borderRadius: 8, padding: "12px 28px", marginBottom: 8, cursor: "pointer" }}>
            {roomCode}
          </div>
          <div style={{ fontSize: 12, color: muted, fontFamily: sans, marginBottom: 36 }}>
            {copied ? "Copied!" : "Click to copy — share this code with the other party"}
          </div>

          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: gold, fontFamily: sans, fontWeight: 700, marginBottom: 20 }}>Select Your Role</div>

          <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            {Object.values(ROLES).map((r) => {
              const taken = r.id === "plaintiff" ? pTaken : dTaken;
              return (
                <button
                  key={r.id}
                  onClick={() => !taken && handleSelectRole(r.id)}
                  disabled={taken}
                  style={{
                    flex: "1 1 230px", maxWidth: 260, padding: "24px 20px", background: taken ? "#F0ECE4" : card,
                    border: `1px solid ${taken ? "#D1CCBF" : border}`, borderRadius: 6,
                    cursor: taken ? "default" : "pointer", textAlign: "left",
                    opacity: taken ? 0.55 : 1, transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { if (!taken) e.currentTarget.style.borderColor = r.color; }}
                  onMouseLeave={(e) => { if (!taken) e.currentTarget.style.borderColor = border; }}
                >
                  <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: taken ? muted : r.color, fontFamily: sans, fontWeight: 700, marginBottom: 6 }}>
                    {taken ? "Taken" : r.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 400, color: dark, marginBottom: 8 }}>{r.party}</div>
                  <div style={{ fontSize: 12, color: muted, fontFamily: sans, lineHeight: 1.6 }}>{r.desc}</div>
                </button>
              );
            })}
          </div>

          {error && <div style={{ marginTop: 20, padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, fontSize: 13, color: "#991B1B", fontFamily: sans }}>{error}</div>}

          <button onClick={() => { setScreen("lobby"); setError(null); }} style={{ marginTop: 28, padding: "8px 20px", background: "transparent", border: `1px solid ${border}`, borderRadius: 4, fontSize: 12, color: muted, fontFamily: sans, cursor: "pointer" }}>
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     CHAT
     ═══════════════════════════════════════════ */
  const me = ROLES[myRole];
  const otherRoleId = myRole === "plaintiff" ? "defendant" : "plaintiff";
  const other = ROLES[otherRoleId];
  const bothJoined = room?.roles?.plaintiff && room?.roles?.defendant;
  const msgs = Array.isArray(room?.messages) ? room.messages : [];
  const isProcessing = room?.processing || false;
  const canSend = bothJoined && !sending && !isProcessing;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: bg, fontFamily: font }}>

      {/* HEADER */}
      <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: gold, fontFamily: sans, fontWeight: 700 }}>
            Live Mediation · Room {roomCode}
          </div>
          <div style={{ fontSize: 16, fontWeight: 400, color: dark }}>Morgan v. NexaGen Therapeutics</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, fontSize: 11, fontFamily: sans, color: muted }}>
            <span><StatusDot active={room?.roles?.plaintiff} /> <span style={{ color: room?.roles?.plaintiff ? ROLES.plaintiff.color : muted }}>Plaintiff</span></span>
            <span><StatusDot active={room?.roles?.defendant} /> <span style={{ color: room?.roles?.defendant ? ROLES.defendant.color : muted }}>Defense</span></span>
          </div>
          <div style={{ padding: "4px 12px", background: me.color + "10", border: `1px solid ${me.color}25`, borderRadius: 3, fontSize: 10, color: me.color, fontFamily: sans, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>
            You: {me.label}
          </div>
          <button onClick={handleReset} style={{ padding: "5px 12px", background: "transparent", border: `1px solid ${border}`, borderRadius: 3, fontSize: 11, color: muted, cursor: "pointer", fontFamily: sans }}>
            Reset
          </button>
        </div>
      </div>

      {/* WAITING BANNER */}
      {!bothJoined && (
        <div style={{ background: "#FFFBEB", borderBottom: "1px solid #FDE68A", padding: "12px 20px", textAlign: "center", fontSize: 13, fontFamily: sans, color: "#92400E" }}>
          Waiting for {other.label} to join with room code <strong style={{ fontFamily: mono, letterSpacing: 2 }}>{roomCode}</strong>…
        </div>
      )}

      {/* MESSAGES */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          {msgs.map((msg, i) => {
            const isMediator = msg.sender === "mediator";
            const isMe = msg.sender === myRole;
            const senderInfo = isMediator
              ? { label: "Mediator", color: gold }
              : ROLES[msg.sender]
              ? { label: ROLES[msg.sender].label, color: ROLES[msg.sender].color }
              : { label: msg.sender, color: muted };

            return (
              <div key={msg.id || i} style={{ marginBottom: 18, display: "flex", flexDirection: "column", alignItems: isMediator ? "center" : isMe ? "flex-end" : "flex-start" }}>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontFamily: sans, fontWeight: 700, color: senderInfo.color, marginBottom: 5 }}>
                  {senderInfo.label}{isMe && !isMediator ? " (You)" : ""}
                </div>
                <div style={{
                  maxWidth: isMediator ? "90%" : "80%",
                  padding: "14px 18px",
                  background: isMediator ? card : isMe ? me.color + "08" : other.color + "08",
                  border: `1px solid ${isMediator ? border : isMe ? me.color + "18" : other.color + "18"}`,
                  borderRadius: isMediator ? 8 : isMe ? "14px 3px 14px 14px" : "3px 14px 14px 14px",
                  fontSize: 14, lineHeight: 1.75, color: dark, fontFamily: sans, fontWeight: 400,
                  whiteSpace: "pre-wrap", wordWrap: "break-word",
                  ...(isMediator ? { boxShadow: "0 1px 4px rgba(0,0,0,0.04)" } : {}),
                }}>
                  {msg.content}
                </div>
              </div>
            );
          })}

          {(sending || isProcessing) && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontFamily: sans, fontWeight: 700, color: gold, marginBottom: 5 }}>Mediator</div>
              <div style={{ padding: "12px 18px", background: card, border: `1px solid ${border}`, borderRadius: 8 }}><Dots /></div>
            </div>
          )}

          {error && <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 4, fontSize: 12, color: "#991B1B", fontFamily: sans, marginBottom: 14 }}>{error}</div>}

          <div ref={chatEnd} />
        </div>
      </div>

      {/* INPUT */}
      <div style={{ background: card, borderTop: `1px solid ${border}`, padding: "14px 20px", flexShrink: 0 }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          {!bothJoined ? (
            <div style={{ textAlign: "center", fontSize: 13, color: muted, fontFamily: sans, padding: "8px 0" }}>
              Waiting for both parties to join before the session begins…
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                  placeholder={isProcessing ? "Mediator is responding…" : "Present your position, respond, or make a proposal…"}
                  disabled={!canSend}
                  rows={2}
                  style={{
                    flex: 1, padding: "10px 14px", border: `1px solid ${border}`, borderRadius: 4,
                    fontSize: 14, fontFamily: sans, color: dark,
                    background: !canSend ? "#F0ECE4" : "#FFF",
                    resize: "vertical", minHeight: 44, maxHeight: 150, outline: "none", lineHeight: 1.5,
                  }}
                  onFocus={(e) => (e.target.style.borderColor = me.color)}
                  onBlur={(e) => (e.target.style.borderColor = border)}
                />
                <button
                  onClick={handleSend}
                  disabled={!canSend || !input.trim()}
                  style={{
                    padding: "10px 22px", height: 44,
                    background: !canSend || !input.trim() ? "#D1CCBF" : me.color,
                    color: "#FFF", border: "none", borderRadius: 4, fontSize: 11, fontFamily: sans,
                    fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase",
                    cursor: !canSend || !input.trim() ? "default" : "pointer", flexShrink: 0,
                  }}
                >
                  Send
                </button>
              </div>
              <div style={{ fontSize: 10, color: "#B0A794", marginTop: 6, fontFamily: sans, textAlign: "center" }}>
                Enter to send · Shift+Enter for new line · Both parties see all messages · The mediator will not evaluate case merits
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
