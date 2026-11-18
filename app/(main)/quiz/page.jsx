"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getSession,
  scheduleReviewSession,
  submitCardReview,
} from "@/services/api";
import { recordAnswer } from "@/components/studyStats";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

// Cards should have options {A,B,C,D} and answer 'A'-'D', but be tolerant of
// arrays, JSON strings, numeric indexes, lowercase letters and "B." / "B)".
function normalizeCard(c) {
  let options = c.options;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      options = {};
    }
  }
  if (Array.isArray(options)) {
    options = options.reduce((acc, opt, i) => {
      acc[LETTERS[i] ?? String(i + 1)] = opt;
      return acc;
    }, {});
  }
  if (!options || typeof options !== "object") options = {};

  let answer = c.answer;
  if (typeof answer === "number") {
    answer = LETTERS[answer];
  } else if (typeof answer === "string") {
    const trimmed = answer.trim();
    const letter = trimmed.match(/^([A-Fa-f])(?:[.):\s]|$)/);
    if (letter) {
      answer = letter[1].toUpperCase();
    } else {
      // The answer may be the option text itself.
      const match = Object.entries(options).find(
        ([, text]) => String(text).trim() === trimmed,
      );
      answer = match ? match[0] : trimmed;
    }
  }

  return { ...c, options, answer };
}

const RATINGS = [
  { value: 0, label: "0", desc: "Blank" },
  { value: 1, label: "1", desc: "Wrong" },
  { value: 2, label: "2", desc: "Hard" },
  { value: 3, label: "3", desc: "Struggled" },
  { value: 4, label: "4", desc: "Good" },
  { value: 5, label: "5", desc: "Easy" },
];

function QuizContent() {
  const searchParams = useSearchParams();
  const deckId = searchParams.get("deckId");
  const router = useRouter();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(Boolean(deckId));
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);
  const [authProvider, setAuthProvider] = useState(null);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [rating, setRating] = useState(null);
  // After the first full pass, a retry is practice only: the SM-2 schedule
  // and the calendar were already updated, so don't submit reviews again.
  const [practiceMode, setPracticeMode] = useState(false);
  const [calendarNote, setCalendarNote] = useState(null);

  useEffect(() => {
    if (!deckId) return;
    let active = true;

    const loadCards = async () => {
      try {
        const [session, res] = await Promise.all([
          getSession().catch(() => null),
          fetch(`/api/cards?deckId=${encodeURIComponent(deckId)}`, {
            cache: "no-store",
          }),
        ]);
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || `Couldn't load this quiz (HTTP ${res.status}).`,
          );
        }
        if (!active) return;
        setUserId(session?.user?.id ?? null);
        setAuthProvider(session?.user?.app_metadata?.provider ?? null);
        setCards(
          Array.isArray(data.cards)
            ? data.cards
                .map(normalizeCard)
                .filter((c) => Object.keys(c.options).length > 0)
            : [],
        );
      } catch (err) {
        console.error("Failed to load cards:", err);
        if (active) setError(err.message || "Couldn't load this quiz.");
      }
      if (active) setLoading(false);
    };
    loadCards();

    return () => {
      active = false;
    };
  }, [deckId, router]);

  const handleAnswer = (option) => {
    if (answered) return;
    const isCorrect = option === cards[current].answer;
    setSelected(option);
    setAnswered(true);
    if (isCorrect) setScore((s) => s + 1);
    if (!practiceMode) recordAnswer(userId, isCorrect);
  };

  const handleNext = () => {
    if (rating === null) return;
    const isLast = current + 1 >= cards.length;

    if (!practiceMode) {
      // Non-blocking SM-2 update; the server recomputes the schedule.
      submitCardReview(cards[current].id, rating).catch((e) => {
        console.error("Error updating card:", e.message);
        if (e.status === 401) router.replace("/login");
      });
    }

    if (isLast) {
      if (!practiceMode) {
        // Non-blocking Google Calendar reminder. Only works for Google
        // sign-ins (needs a Google token); email users get a 401/403 and we
        // just skip it quietly.
        scheduleReviewSession({
          deckId,
          totalQuestions: cards.length,
          mistakes: cards.length - score,
        })
          .then((result) => {
            if (result?.scheduled || result?.merged) {
              setCalendarNote(
                `📅 Next review on your Google Calendar: ${result.date}`,
              );
            }
          })
          .catch((e) => {
            // Email/password users have no Google token: skip silently.
            console.info("Calendar scheduling skipped:", e.message);
            if (
              authProvider === "google" &&
              e.code === "GOOGLE_REAUTH_REQUIRED"
            ) {
              setCalendarNote(
                "Sign in with Google again to add review reminders to your calendar.",
              );
            }
          });
      }
      setFinished(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
      setAnswered(false);
      setRating(null);
    }
  };

  const handleRetry = () => {
    setPracticeMode(true);
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
    setRating(null);
    setScore(0);
    setFinished(false);
  };

  const getOptionStyle = (option) => {
    const base = {
      width: "100%",
      padding: "14px 16px",
      margin: "8px 0",
      borderRadius: "10px",
      border: "1px solid #d4c4b0",
      backgroundColor: "#f5f0e8",
      color: "#3d2b1f",
      fontSize: "15px",
      textAlign: "left",
      cursor: answered ? "default" : "pointer",
      transition: "all 0.2s ease",
      fontFamily: "'Inter', sans-serif",
    };
    if (!answered) return base;
    if (option === cards[current].answer) {
      return {
        ...base,
        backgroundColor: "#d4edda",
        border: "1px solid #82c98a",
        color: "#2d6a35",
      };
    }
    if (option === selected && option !== cards[current].answer) {
      return {
        ...base,
        backgroundColor: "#fde8e8",
        border: "1px solid #e88282",
        color: "#8b2020",
      };
    }
    return { ...base, opacity: 0.5 };
  };

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#f5f0e8",
          color: "#6B4226",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Loading your quiz...
      </div>
    );

  if (!deckId || error)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#f5f0e8",
          fontFamily: "'Inter', sans-serif",
          color: "#3d2b1f",
          padding: "20px",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>
          {error ? "⚠️" : "🗂️"}
        </div>
        <h2 style={{ margin: "0 0 8px" }}>
          {error ? "Couldn't load this quiz" : "No deck selected"}
        </h2>
        <p style={{ color: "#8a6a50" }} role={error ? "alert" : undefined}>
          {error || "Pick a deck from your categories to start a quiz."}
        </p>
        <button
          type="button"
          onClick={() => router.push(error ? "/dashboard" : "/categories_deck")}
          style={{
            marginTop: "20px",
            padding: "12px 32px",
            backgroundColor: "#6B4226",
            color: "white",
            border: "none",
            borderRadius: "10px",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          {error ? "Back to Dashboard" : "Browse Categories"}
        </button>
      </div>
    );

  if (cards.length === 0)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#f5f0e8",
          fontFamily: "'Inter', sans-serif",
          color: "#3d2b1f",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
        <h2 style={{ margin: "0 0 8px" }}>No cards due today!</h2>
        <p style={{ color: "#8a6a50" }}>
          This deck is all caught up. Check back later or upload another
          lecture.
        </p>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          style={{
            marginTop: "20px",
            padding: "12px 32px",
            backgroundColor: "transparent",
            color: "#6B4226",
            border: "1px solid #6B4226",
            borderRadius: "10px",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
        <button
          type="button"
          onClick={() => router.push("/upload")}
          style={{
            marginTop: "20px",
            padding: "12px 32px",
            backgroundColor: "#6B4226",
            color: "white",
            border: "none",
            borderRadius: "10px",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          Upload PDF
        </button>
      </div>
    );

  if (finished)
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#f5f0e8",
          fontFamily: "'Inter', sans-serif",
          color: "#3d2b1f",
          padding: "20px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: "64px", marginBottom: "16px" }}>
          {score === cards.length
            ? "🏆"
            : score >= cards.length / 2
              ? "👍"
              : "📖"}
        </div>
        <h1 style={{ fontSize: "2rem", margin: "0 0 8px" }}>Quiz Complete!</h1>
        <p
          style={{
            color: "#8a6a50",
            marginBottom: calendarNote ? "8px" : "32px",
          }}
        >
          You got {score} out of {cards.length} correct
          {practiceMode ? " (practice round)" : ""}
        </p>
        {calendarNote && (
          <p
            role="status"
            style={{ color: "#6B4226", fontSize: "13px", margin: "0 0 24px" }}
          >
            {calendarNote}
          </p>
        )}
        <div
          style={{
            width: "100%",
            maxWidth: "380px",
            backgroundColor: "#fffdf7",
            border: "1px solid #e8ddd0",
            borderRadius: "16px",
            padding: "24px",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "3rem",
              fontWeight: "700",
              color: "#6B4226",
              marginBottom: "4px",
            }}
          >
            {Math.round((score / cards.length) * 100)}%
          </div>
          <p style={{ color: "#8a6a50", margin: "0 0 24px" }}>
            {score === cards.length
              ? "Perfect score! Outstanding!"
              : score >= cards.length / 2
                ? "Good job! Keep studying!"
                : "Keep practicing, you'll get there!"}
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            style={{
              width: "100%",
              padding: "13px",
              backgroundColor: "#6B4226",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: "pointer",
              marginBottom: "10px",
            }}
          >
            View Dashboard
          </button>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              width: "100%",
              padding: "13px",
              backgroundColor: "transparent",
              color: "#6B4226",
              border: "1px solid #6B4226",
              borderRadius: "10px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Retry Quiz
          </button>
        </div>
      </div>
    );

  const card = cards[current];
  const isCorrect = answered && isCorrect;
  // Keep the self-rating consistent with the actual result: SM-2 treats
  // 0-2 as a failed recall and 3-5 as a successful one.
  const allowedRatings = isCorrect ? [3, 4, 5] : [0, 1, 2];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f0e8",
        fontFamily: "'Inter', sans-serif",
        padding: "40px 20px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "500px", margin: "0 auto" }}>
        {/* Progress bar */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span style={{ color: "#8a6a50", fontSize: "13px" }}>
              Question {current + 1} of {cards.length}
            </span>
            <span style={{ color: "#8a6a50", fontSize: "13px" }}>
              Score: {score}
            </span>
          </div>
          <div
            style={{
              height: "6px",
              backgroundColor: "#e0d5c8",
              borderRadius: "99px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${((current + 1) / cards.length) * 100}%`,
                backgroundColor: "#6B4226",
                borderRadius: "99px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Question card */}
        <div
          style={{
            backgroundColor: "#fffdf7",
            border: "1px solid #e8ddd0",
            borderRadius: "16px",
            padding: "28px",
            marginBottom: "16px",
            boxShadow: "0 4px 24px rgba(101,72,42,0.06)",
          }}
        >
          <p
            style={{
              color: "#8a6a50",
              fontSize: "12px",
              margin: "0 0 12px",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Question {current + 1}
          </p>
          <h2
            style={{
              color: "#3d2b1f",
              fontSize: "1.2rem",
              fontWeight: "600",
              margin: "0",
              lineHeight: "1.5",
            }}
          >
            {card.question}
          </h2>
        </div>

        {/* Options */}
        <div style={{ marginBottom: "16px" }}>
          {Object.entries(card.options).map(([key, value]) => (
            <button
              type="button"
              key={key}
              onClick={() => handleAnswer(key)}
              disabled={answered}
              aria-pressed={selected === key}
              style={getOptionStyle(key)}
            >
              {key}. {value}
            </button>
          ))}
        </div>

        {/* Explanation */}
        {answered && (
          <div
            style={{
              backgroundColor: isCorrect ? "#d4edda" : "#fde8e8",
              border: `1px solid ${isCorrect ? "#82c98a" : "#e88282"}`,
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
              animation: "fadeUp 0.3s ease",
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontWeight: "600",
                color: isCorrect ? "#2d6a35" : "#8b2020",
              }}
            >
              {isCorrect ? "✅ Correct!" : "❌ Incorrect"}
            </p>
            {!isCorrect && card.options[card.answer] !== undefined && (
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#8b2020",
                }}
              >
                Correct answer: {card.answer}. {card.options[card.answer]}
              </p>
            )}
            {card.explanation && (
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: isCorrect ? "#2d6a35" : "#8b2020",
                }}
              >
                {card.explanation}
              </p>
            )}
          </div>
        )}

        {/* Rating System */}
        {answered && (
          <div
            style={{
              backgroundColor: "rgba(255,253,247,0.9)",
              border: "1px solid rgba(232,221,208,0.9)",
              borderRadius: "14px",
              padding: "18px 20px",
              marginBottom: "16px",
              animation: "fadeUp 0.3s ease 0.1s both",
            }}
          >
            <p
              style={{
                color: "#3d2b1f",
                fontSize: "13px",
                fontWeight: "600",
                margin: "0 0 12px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              How well did you know this?
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              {RATINGS.map((r) => {
                const allowed = allowedRatings.includes(r.value);
                return (
                  <button
                    type="button"
                    key={r.value}
                    onClick={() => setRating(r.value)}
                    disabled={!allowed}
                    aria-pressed={rating === r.value}
                    aria-label={`${r.label} - ${r.desc}`}
                    style={{
                      padding: "10px 4px",
                      borderRadius: "10px",
                      border: `2px solid ${rating === r.value ? "#6B4226" : "#d4c4b0"}`,
                      backgroundColor:
                        rating === r.value ? "#6B4226" : "#f5f0e8",
                      color: rating === r.value ? "white" : "#6B4226",
                      fontSize: "15px",
                      fontWeight: "700",
                      cursor: allowed ? "pointer" : "not-allowed",
                      opacity: allowed ? 1 : 0.35,
                      transition: "all 0.15s ease",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "3px",
                    }}
                  >
                    <span>{r.label}</span>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: "400",
                        opacity: 0.8,
                      }}
                    >
                      {r.desc}
                    </span>
                  </button>
                );
              })}
            </div>
            <p
              style={{
                color: "#8a6a50",
                fontSize: "12px",
                margin: 0,
                textAlign: "center",
                minHeight: "16px",
              }}
            >
              {rating === null && "Rate to continue →"}
              {rating === 0 && "😶 Complete blank — will review tomorrow"}
              {rating === 1 && "😟 Wrong — will review tomorrow"}
              {rating === 2 && "😕 Wrong but familiar — reviewing soon"}
              {rating === 3 && "😐 Correct but struggled — reviewing soon"}
              {rating === 4 && "🙂 Correct with effort — good progress!"}
              {rating === 5 && "😄 Perfect! This card will appear less often"}
            </p>
          </div>
        )}

        {/* Next button */}
        {answered && (
          <button
            type="button"
            onClick={handleNext}
            disabled={rating === null}
            style={{
              width: "100%",
              padding: "14px",
              backgroundColor: rating === null ? "#c4a882" : "#6B4226",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: rating === null ? "not-allowed" : "pointer",
              animation: "fadeUp 0.3s ease",
              transition: "background-color 0.2s ease",
            }}
          >
            {rating === null
              ? "Rate your answer first"
              : current + 1 >= cards.length
                ? "See Results →"
                : "Next Question →"}
          </button>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            backgroundColor: "#f5f0e8",
            color: "#6B4226",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Loading your quiz...
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  );
}
