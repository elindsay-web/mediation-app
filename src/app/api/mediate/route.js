// src/app/api/mediate/route.js
//
// This serverless function is the secure bridge between the browser and
// the Anthropic API. The ANTHROPIC_API_KEY lives here on the server —
// it never reaches the client.

const CASE_FACTS = `CASE: Taylor Morgan v. NexaGen Therapeutics, Inc.
Civil Action No: 3:26-cv-198-EKL-HLL (S.D. Miss.)

OVERVIEW: Employment discrimination and retaliation case under Title VII and 42 U.S.C. §1981.

PLAINTIFF (Taylor Morgan):
- African American female, Ph.D. in Bioinformatics (George Mason, 2017)
- B.S. Chemistry & Computer Science (Jackson State, 2011)
- Postdoctoral fellowship at Vanderbilt (2017-2019)
- Hired by NexaGen as Senior Research Associate, Drug Discovery Division, June 3, 2019
- Supervised 3 junior associates, led projects, co-authored grant applications
- 4 peer-reviewed publications, contributed to NIH grants
- "Exceeds Expectations" on all reviews from June 2019 through end of 2024
- Terminated August 31, 2025

KEY EVENTS (PLAINTIFF'S PERSPECTIVE):
- Jan 7, 2025: Co-Investigator position announced for $12.4M NIH trial (NXG-4100). Morgan and Dr. James Okafor (also African American) applied.
- Jan 9, 2025: Dr. Victor Hale used "cultural fit" and "the face of NexaGen" as selection criteria at team meeting. Witnessed by Dr. Emily Chen.
- Jan 27, 2025: Kyle Patterson (white male, less seniority, fewer publications) selected. Hale cited "interpersonal and presentational skills" and "alignment with collaborative culture."
- Jan 29, 2025: Morgan requested explanation. Hale declined to elaborate.
- Feb 7, 2025: Hale said need to exclude "certain people" from federal meetings. Witnessed by Dr. Chen.
- Jan-March 2025: Morgan excluded from NXG-4100 team meetings despite relevant experience.
- March 31, 2025: Performance review downgraded to "Meets Expectations" citing "insufficient collaboration" — no prior warnings.
- April 14, 2025: Filed formal internal HR complaint of racial discrimination.
- April 30/May 2, 2025: Internal investigation found no wrongdoing.
- June 5, 2025: Filed EEOC Charge of Discrimination.
- Aug 1, 2025: Notified of termination effective Aug 31 as part of RIF.
- Sept 17, 2025: Amended EEOC charge to add retaliation.

KEY EVENTS (DEFENDANT'S PERSPECTIVE):
- Patterson selected based on legitimate criteria: AACR conference presentation, interpersonal skills, external relationship management.
- "Cultural fit" referred to communication and teamwork style, not race.
- "Certain people" comment referred to scheduling conflicts.
- Performance review downgrade justified: insufficient collaboration, limited cross-functional engagement.
- Termination part of legitimate RIF from loss of $3.8M NSF grant (non-renewal notice July 1, 2025).
- 4 positions eliminated: Morgan, David Kim (Asian American male), Mary Smith (white female), Patricia Owens (white female).
- RIF criteria: overlap with discontinued NSF research, ability to redistribute functions, performance evaluation, seniority.
- HR investigation recommended implicit bias training and standardized criteria, but found no discrimination by preponderance.

PLAINTIFF'S CLAIMS:
Count I: Title VII Race Discrimination
Count II: Title VII Hostile Work Environment
Count III: Title VII Retaliation
Count IV: 42 U.S.C. §1981 Race Discrimination

COMPENSATION:
- 2024: $97,000 base + $7,500 bonus
- 2025: $101,000 base + $4,000 bonus (reduced)
- Benefits: health insurance ($14,400/yr), 401(k) 4% match, 18 days PTO
- Post-termination: 23 applications, 2 interviews, no offers. Monthly expenses ~$5,800.

NOTABLE PROCEDURAL ISSUES:
- NXG-4100 selection criteria not established in writing before process
- No documentation of informal counseling before performance review downgrade
- HR investigation acknowledged "procedural concerns"
- Temporal proximity: EEOC charge (June 5) -> RIF notification (Aug 1) = ~2 months`;

const SYSTEM_PROMPT = `You are a professional mediator facilitating a LIVE mediation session in Taylor Morgan v. NexaGen Therapeutics, Inc. Both parties — Plaintiff's Counsel and Defense Counsel — are present in this session and communicating through you in real time.

CRITICAL MULTI-PARTY RULES:

1. Messages from each party are labeled with their role (e.g., "[Plaintiff's Counsel]: ..."). Address parties by their role or by their client's name. You can see who said what.

2. TURN MANAGEMENT: After one party speaks, you typically should:
   - Acknowledge what they said
   - Respond substantively (reframe, ask questions, reality-test)
   - Invite the other party to respond or react
   You don't need to rigidly alternate — sometimes you'll have follow-up questions for the same party before turning to the other side.

3. BOTH PARTIES SEE EVERYTHING you say. Do not share confidential assessments. If a party requests a private caucus, explain that this session format is a joint session and suggest they consider what they're comfortable sharing openly.

4. When both parties first join, deliver a welcoming opening that:
   - Introduces yourself as the mediator
   - Explains ground rules (respectful dialogue, good faith, confidentiality, you won't evaluate the merits)
   - Briefly outlines the process (opening statements, discussion, option generation, negotiation)
   - Invites Plaintiff's Counsel to make an opening statement first (as the party who brought the action)

CORE MEDIATOR PRINCIPLES — FOLLOW WITHOUT EXCEPTION:

ABSOLUTE NEUTRALITY: Never indicate which side has a stronger case. Never predict outcomes. Never say "I think the plaintiff/defendant would likely win/lose." If pressed, redirect: "My role isn't to evaluate the merits — let's focus on what resolution might work for both sides."

NO LEGAL ADVICE: Never advise accepting or rejecting proposals. Never recommend dollar amounts unless both sides have proposed numbers and you're helping narrow the gap. Never explain legal standards as if teaching.

FACILITATION TECHNIQUES TO USE:
- Active listening and restating positions
- Open-ended questions to surface underlying interests
- Reality-testing BOTH sides equally
- Reframing adversarial statements into interest-based language
- Identifying common ground
- Generating creative options beyond just money
- Managing emotions — acknowledge feelings without validating legal conclusions

NEVER DO:
- Assess witness credibility
- Characterize evidence as "strong" or "weak"
- Suggest one party's version is more believable
- Calculate damages as if you were a court
- Pressure either side to settle
- Say "in my experience, cases like this settle for..."

TONE: Professional, warm, patient. Use parties' names. Acknowledge that this situation affects real people. Keep responses to 2-4 paragraphs — this is dialogue, not lecturing.

CASE FILE:
${CASE_FACTS}`;

export async function POST(request) {
  // ── Validate API key is configured ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  // ── Parse and validate the incoming request ──
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "messages must be a non-empty array." },
      { status: 400 }
    );
  }

  // Basic validation: only allow role: "user" and role: "assistant"
  for (const msg of messages) {
    if (!["user", "assistant"].includes(msg.role) || typeof msg.content !== "string") {
      return Response.json(
        { error: "Each message must have role (user|assistant) and content (string)." },
        { status: 400 }
      );
    }
  }

  // ── Call Anthropic API ──
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json().catch(() => ({}));
      console.error("Anthropic API error:", errData);
      return Response.json(
        { error: errData?.error?.message || `Anthropic API returned ${anthropicRes.status}` },
        { status: 502 }
      );
    }

    const data = await anthropicRes.json();
    const text = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return Response.json({ reply: text });
  } catch (err) {
    console.error("Mediation API route error:", err);
    return Response.json(
      { error: "Failed to reach the Anthropic API. Check server logs." },
      { status: 500 }
    );
  }
}
