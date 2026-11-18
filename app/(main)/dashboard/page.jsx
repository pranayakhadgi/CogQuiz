"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, signOut } from "@/services/api";
import CogQuizLogo from "@/components/CogQuizLogo";
import { getStudyStats } from "@/components/studyStats";

function useCountUp(target, duration = 1000) {
  const safeTarget =
    Number.isFinite(Number(target)) && Number(target) > 0
      ? Math.round(Number(target))
      : 0;
  const [count, setCount] = useState(0);
  useEffect(() => {
    let frame;
    const startTime = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      setCount(Math.floor(safeTarget * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safeTarget, duration]);
  return count;
}

const onKeyActivate = (handler) => (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handler();
  }
};

export default function DashboardPage() {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [dueCards, setDueCards] = useState([]);
  const [stats, setStats] = useState({
    streak: 0,
    accuracy: 0,
    totalStudied: 0,
    categories: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    const loadDashboardData = async () => {
      try {
        const session = await getSession();
        if (!session) {
          router.replace("/login");
          return;
        }

        const [dashboardRes, dueCardsRes] = await Promise.all([
          fetch("/api/dashboard", { cache: "no-store" }),
          fetch("/api/cards", { cache: "no-store" }),
        ]);

        if (dashboardRes.status === 401 || dueCardsRes.status === 401) {
          router.replace("/login");
          return;
        }

        const [dashboardJson, dueCardsJson] = await Promise.all([
          dashboardRes.json().catch(() => ({})),
          dueCardsRes.json().catch(() => ({})),
        ]);

        if (!dashboardRes.ok) {
          throw new Error(
            dashboardJson.error ||
              `Couldn't load your categories (HTTP ${dashboardRes.status}).`,
          );
        }
        if (!dueCardsRes.ok) {
          throw new Error(
            dueCardsJson.error ||
              `Couldn't load your due cards (HTTP ${dueCardsRes.status}).`,
          );
        }

        if (!active) return;
        const cats = Array.isArray(dashboardJson.data)
          ? dashboardJson.data
          : [];
        setCategories(cats);
        setDueCards(
          Array.isArray(dueCardsJson.cards) ? dueCardsJson.cards : [],
        );
        setStats({
          ...getStudyStats(session.user?.id),
          categories: cats.length,
        });
        setError(null);
        setLoading(false);
        setVisible(true);
      } catch (err) {
        console.error("Error loading dashboard:", err);
        if (active) {
          setError(
            err.message || "Something went wrong loading your dashboard.",
          );
          setLoading(false);
          setVisible(true);
        }
      }
    };
    loadDashboardData();

    return () => {
      active = false;
    };
  }, [router, reloadKey]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
      setSigningOut(false);
    }
  };

  const animatedStreak = useCountUp(stats.streak);
  const animatedAccuracy = useCountUp(stats.accuracy);
  const animatedStudied = useCountUp(stats.totalStudied);
  const animatedCategories = useCountUp(stats.categories);

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
        <div style={{ textAlign: "center" }} role="status">
          <div
            style={{
              width: "36px",
              height: "36px",
              border: "3px solid #d4c4b0",
              borderTop: "3px solid #6B4226",
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          Loading your dashboard...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  // Group due cards by category. Cards carry category_id when the API adds it;
  // otherwise fall back to the deck -> category mapping from /api/dashboard.
  const deckToCategory = {};
  categories.forEach((cat) =>
    (cat.decks || []).forEach((d) => {
      deckToCategory[d.id] = cat.id;
    }),
  );
  const dueByCategory = {};
  dueCards.forEach((card) => {
    const catId = card.category_id ?? deckToCategory[card.deck_id];
    if (catId == null) return;
    dueByCategory[catId] = (dueByCategory[catId] || 0) + 1;
  });
  const categoriesWithDue = categories
    .map((cat) => ({ ...cat, dueCount: dueByCategory[cat.id] || 0 }))
    .filter((cat) => cat.dueCount > 0)
    .sort((a, b) => b.dueCount - a.dueCount);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f0e8",
        fontFamily: "'Inter', sans-serif",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      {/* ── BACKGROUND ── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-150px",
            left: "-120px",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(180,130,90,0.22) 0%, transparent 60%)",
            animation: "floatSlow1 18s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(210,185,150,0.24) 0%, transparent 60%)",
            animation: "floatSlow2 22s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-120px",
            left: "25%",
            width: "550px",
            height: "450px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(160,110,70,0.20) 0%, transparent 60%)",
            animation: "floatSlow3 26s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.60), transparent 300%)",
            animation: "breathe 10s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.08), transparent 60%)",
            animation: "lightSweep 12s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `
            linear-gradient(rgba(107,66,38,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(107,66,38,0.03) 1px, transparent 1px)
          `,
            backgroundSize: "40px 40px",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, transparent 60%, rgba(180,140,100,0.08) 100%)",
          }}
        />
      </div>

      {/* ── NAVBAR ── */}
      <nav
        style={{
          backgroundColor: "rgba(255,253,247,0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(232,221,208,0.8)",
          padding: "0 20px",
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <CogQuizLogo size={40} />
          <span
            style={{ fontWeight: "700", color: "#3d2b1f", fontSize: "16px" }}
          >
            CogQuiz
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              padding: "8px 14px",
              backgroundColor: "transparent",
              color: "#6B4226",
              border: "1px solid #6B4226",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: signingOut ? "not-allowed" : "pointer",
              opacity: signingOut ? 0.6 : 1,
            }}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            style={{
              padding: "8px 18px",
              backgroundColor: "#6B4226",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "transform 0.15s ease, background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.backgroundColor = "#8B5E3C";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.backgroundColor = "#6B4226";
            }}
          >
            + Upload
          </button>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div
        style={{
          maxWidth: "560px",
          margin: "0 auto",
          padding: "28px 16px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <h1
            style={{
              color: "#3d2b1f",
              fontSize: "1.8rem",
              fontWeight: "700",
              margin: "0 0 4px",
            }}
          >
            Dashboard
          </h1>
          <p style={{ color: "#8a6a50", margin: 0, fontSize: "14px" }}>
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: "#fff0f0",
              border: "1px solid #ffcccc",
              borderRadius: "10px",
              padding: "14px 16px",
              marginBottom: "20px",
              color: "#cc4444",
              fontSize: "14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <span>⚠️ {error}</span>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                background: "none",
                border: "1px solid #cc4444",
                borderRadius: "8px",
                padding: "4px 10px",
                cursor: "pointer",
                color: "#cc4444",
                fontSize: "13px",
                fontWeight: "600",
                whiteSpace: "nowrap",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Stats Grid */}
        {
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "28px",
            }}
          >
            {[
              { emoji: "🔥", value: animatedStreak, label: "Day streak" },
              { emoji: "🎯", value: `${animatedAccuracy}%`, label: "Accuracy" },
              { emoji: "📚", value: animatedStudied, label: "Cards studied" },
              {
                emoji: "🗂️",
                value: animatedCategories,
                label: stats.categories === 1 ? "Category" : "Categories",
                clickable: true,
              },
            ].map((stat, i) => (
              <div
                key={i}
                className={
                  stat.clickable ? "stat-card category-card" : "stat-card"
                }
                {...(stat.clickable && {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": `${stats.categories} categories, view all`,
                  onClick: () => router.push("/categories_deck"),
                  onKeyDown: onKeyActivate(() =>
                    router.push("/categories_deck"),
                  ),
                })}
                style={{
                  backgroundColor: "rgba(255,253,247,0.85)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: stat.clickable
                    ? "1px solid #6B4226"
                    : "1px solid rgba(232,221,208,0.9)",
                  borderRadius: "14px",
                  padding: "18px",
                  boxSizing: "border-box",
                  cursor: stat.clickable ? "pointer" : "default",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  animation: `fadeUp 0.4s ease ${i * 0.08}s both`,
                  position: "relative",
                }}
              >
                <div style={{ fontSize: "28px", marginBottom: "4px" }}>
                  {stat.emoji}
                </div>
                <div
                  style={{
                    fontSize: "1.8rem",
                    fontWeight: "700",
                    color: "#6B4226",
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    color: "#8a6a50",
                    fontSize: "13px",
                    marginTop: "4px",
                  }}
                >
                  {stat.label}
                </div>
                {stat.clickable && (
                  <div
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      color: "#6B4226",
                      fontSize: "14px",
                    }}
                  >
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        }

        {/* Due Today */}
        {!error && (
          <div
            style={{
              backgroundColor: "rgba(255,253,247,0.85)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(232,221,208,0.9)",
              borderRadius: "16px",
              padding: "20px",
              marginBottom: "20px",
              animation: "fadeUp 0.4s ease 0.3s both",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h2
                style={{
                  color: "#3d2b1f",
                  fontSize: "1.1rem",
                  fontWeight: "600",
                  margin: 0,
                }}
              >
                Due Today
              </h2>
              <span
                style={{
                  backgroundColor: "#6B4226",
                  color: "white",
                  borderRadius: "99px",
                  padding: "3px 10px",
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                {categoriesWithDue.length}{" "}
                {categoriesWithDue.length === 1 ? "subject" : "subjects"}
              </span>
            </div>

            {categoriesWithDue.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>✅</div>
                <p
                  style={{
                    color: "#6B4226",
                    fontWeight: "600",
                    margin: "0 0 4px",
                  }}
                >
                  All caught up!
                </p>
                <p style={{ color: "#8a6a50", fontSize: "13px", margin: 0 }}>
                  No cards due today. Upload more lectures!
                </p>
              </div>
            ) : (
              <>
                {categoriesWithDue.map((cat, i) => (
                  <div
                    key={cat.id}
                    className="card-row"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      router.push(`/categories_deck?open=${cat.id}`)
                    }
                    onKeyDown={onKeyActivate(() =>
                      router.push(`/categories_deck?open=${cat.id}`),
                    )}
                    style={{
                      padding: "14px",
                      margin: "8px 0",
                      backgroundColor: "rgba(245,240,232,0.8)",
                      borderRadius: "10px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                      animation: `fadeUp 0.3s ease ${0.35 + i * 0.05}s both`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: "#3d2b1f",
                          margin: "0 0 4px",
                          fontSize: "14px",
                          fontWeight: "600",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cat.name}
                      </p>
                      <p
                        style={{
                          color: "#8a6a50",
                          margin: 0,
                          fontSize: "12px",
                        }}
                      >
                        {cat.dueCount} {cat.dueCount === 1 ? "card" : "cards"}{" "}
                        due today
                      </p>
                    </div>
                    <span
                      style={{
                        backgroundColor: "#6B4226",
                        color: "white",
                        borderRadius: "99px",
                        padding: "3px 10px",
                        fontSize: "12px",
                        fontWeight: "600",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cat.dueCount} due
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatSlow1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 30px) scale(1.08); }
        }
        @keyframes floatSlow2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 40px) scale(1.06); }
        }
        @keyframes floatSlow3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -35px) scale(1.07); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.35; }
        }
        @keyframes lightSweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .stat-card:hover {
          transform: translateY(-4px) !important;
          box-shadow: 0 8px 24px rgba(107,66,38,0.12) !important;
        }
        .category-box:hover {
          transform: translateY(-4px) !important;
          background-color: #fff !important;
          box-shadow: 0 8px 20px rgba(107,66,38,0.10) !important;
          border-color: #6B4226 !important;
        }
        .card-row:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(107,66,38,0.10) !important;
        }
        .primary-btn:hover {
          transform: translateY(-2px) !important;
          background-color: #8B5E3C !important;
        }
        .primary-btn:active {
          transform: translateY(0px) !important;
        }
        .category-card:hover {
          transform: translateY(-4px) !important;
          box-shadow: 0 8px 24px rgba(107,66,38,0.18) !important;
          background-color: rgba(107,66,38,0.06) !important;
        }
        @media (max-width: 480px) {
          nav { padding: 0 12px !important; }
        }
      `}</style>
    </div>
  );
}
