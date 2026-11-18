"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CogQuizLogo from "@/components/CogQuizLogo";

const onKeyActivate = (handler) => (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    handler();
  }
};

function CategoriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [decksByCategory, setDecksByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortBy, setSortBy] = useState("newest");
  // Allow the dashboard to deep-link into an expanded category (?open=<id>).
  const [expandedId, setExpandedId] = useState(() => searchParams.get("open"));

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            data.error || `Couldn't load categories (HTTP ${res.status}).`,
          );
        }

        const cats = Array.isArray(data.category) ? data.category : [];

        // Fetch each category's due decks in parallel; one failing category
        // shouldn't break the whole page.
        const entries = await Promise.all(
          cats.map(async (cat) => {
            try {
              const deckRes = await fetch("/api/decks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId: cat.id }),
              });
              const deckData = await deckRes.json().catch(() => ({}));
              if (
                deckRes.ok &&
                deckData.success &&
                Array.isArray(deckData.decks)
              ) {
                return [cat.id, deckData.decks];
              }
              console.error(
                `Decks request failed for category ${cat.id}:`,
                deckData.error || deckRes.status,
              );
            } catch (err) {
              console.error(`Network error for category ${cat.id}:`, err);
            }
            return [cat.id, []];
          }),
        );

        if (!active) return;
        setCategories(cats);
        setDecksByCategory(Object.fromEntries(entries));
        setError(null);
      } catch (err) {
        console.error(err);
        if (active) setError(err.message || "Couldn't load categories.");
      }
      if (active) setLoading(false);
    };
    load();

    return () => {
      active = false;
    };
  }, [router, reloadKey]);

  const sortedCategories = useMemo(() => {
    const dueCount = (cat) => (decksByCategory[cat.id] || []).length;
    const created = (cat) => {
      const t = Date.parse(cat.created_at);
      return Number.isFinite(t) ? t : 0;
    };
    const list = [...categories];
    if (sortBy === "name") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortBy === "due") {
      list.sort((a, b) => dueCount(b) - dueCount(a));
    } else if (sortBy === "oldest") {
      list.sort((a, b) => created(a) - created(b));
    } else {
      list.sort((a, b) => created(b) - created(a));
    }
    return list;
  }, [categories, decksByCategory, sortBy]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
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
          Loading categories...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f0e8",
        fontFamily: "'Inter', sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* Navbar */}
      <nav
        style={{
          backgroundColor: "rgba(255,253,247,0.95)",
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
          <CogQuizLogo size={36} />
          <span
            style={{ fontWeight: "700", color: "#3d2b1f", fontSize: "16px" }}
          >
            CogQuiz
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "8px 16px",
            backgroundColor: "transparent",
            color: "#6B4226",
            border: "1px solid #6B4226",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            transition: "transform 0.15s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.transform = "translateY(-2px)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.transform = "translateY(0)")
          }
        >
          ← Dashboard
        </button>
      </nav>

      <div
        style={{ maxWidth: "560px", margin: "0 auto", padding: "28px 16px" }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <div>
            <h1
              style={{
                color: "#3d2b1f",
                fontSize: "1.8rem",
                fontWeight: "700",
                margin: "0 0 4px",
              }}
            >
              Categories
            </h1>
            <p style={{ color: "#8a6a50", margin: 0, fontSize: "14px" }}>
              {categories.length}{" "}
              {categories.length === 1 ? "subject" : "subjects"}
            </p>
          </div>
          {categories.length > 1 && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "#8a6a50",
                fontSize: "13px",
              }}
            >
              Sort
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid #d4c4b0",
                  backgroundColor: "rgba(255,253,247,0.9)",
                  color: "#6B4226",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name (A–Z)</option>
                <option value="due">Most due</option>
              </select>
            </label>
          )}
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

        {!error && categories.length === 0 && (
          <div
            style={{
              backgroundColor: "rgba(255,253,247,0.9)",
              border: "1px solid rgba(232,221,208,0.9)",
              borderRadius: "14px",
              padding: "32px 20px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📚</div>
            <p
              style={{ color: "#6B4226", fontWeight: "600", margin: "0 0 4px" }}
            >
              No categories yet
            </p>
            <p
              style={{ color: "#8a6a50", fontSize: "13px", margin: "0 0 16px" }}
            >
              Upload a lecture PDF and we&apos;ll sort it into a category.
            </p>
            <button
              type="button"
              onClick={() => router.push("/upload")}
              style={{
                padding: "10px 20px",
                backgroundColor: "#6B4226",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Upload PDF
            </button>
          </div>
        )}

        {/* Categories List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {sortedCategories.map((cat, i) => {
            const decks = decksByCategory[cat.id] || [];
            const isExpanded = String(expandedId) === String(cat.id);
            const toggle = () => setExpandedId(isExpanded ? null : cat.id);
            return (
              <div
                key={cat.id}
                style={{ animation: `fadeUp 0.3s ease ${i * 0.06}s both` }}
              >
                {/* Category Row */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={toggle}
                  onKeyDown={onKeyActivate(toggle)}
                  style={{
                    backgroundColor: "rgba(255,253,247,0.9)",
                    border: `1px solid ${isExpanded ? "#6B4226" : "rgba(232,221,208,0.9)"}`,
                    borderRadius: isExpanded ? "14px 14px 0 0" : "14px",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  className="category-row"
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                    }}
                  >
                    <div
                      style={{
                        width: "44px",
                        height: "44px",
                        backgroundColor: "#f5f0e8",
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px",
                        flexShrink: 0,
                      }}
                    >
                      📚
                    </div>
                    <div>
                      <p
                        style={{
                          color: "#3d2b1f",
                          margin: "0 0 3px",
                          fontSize: "15px",
                          fontWeight: "600",
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
                        {decks.length}{" "}
                        {decks.length === 1 ? "deck due" : "decks due"}
                      </p>
                    </div>
                  </div>
                  <div
                    style={{
                      color: "#6B4226",
                      fontSize: "18px",
                      transition: "transform 0.2s ease",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  >
                    →
                  </div>
                </div>

                {/* Expanded Decks */}
                {isExpanded && (
                  <div
                    style={{
                      backgroundColor: "rgba(245,240,232,0.6)",
                      border: "1px solid #6B4226",
                      borderTop: "none",
                      borderRadius: "0 0 14px 14px",
                      padding: "8px 12px 12px",
                    }}
                  >
                    {decks.length === 0 ? (
                      <p
                        style={{
                          color: "#8a6a50",
                          fontSize: "13px",
                          textAlign: "center",
                          padding: "12px 0",
                          margin: 0,
                        }}
                      >
                        No decks due today — nice work!
                      </p>
                    ) : (
                      decks.map((deck, j) => (
                        <div
                          key={deck.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 14px",
                            margin: "6px 0",
                            backgroundColor: "rgba(255,253,247,0.9)",
                            borderRadius: "10px",
                            gap: "12px",
                            animation: `fadeUp 0.2s ease ${j * 0.04}s both`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <div style={{ fontSize: "18px" }}>📄</div>
                            <div style={{ minWidth: 0 }}>
                              <p
                                style={{
                                  color: "#3d2b1f",
                                  margin: "0 0 2px",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {deck.title || "Untitled deck"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(
                                `/quiz?deckId=${encodeURIComponent(deck.id)}`,
                              );
                            }}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#6B4226",
                              color: "white",
                              border: "none",
                              borderRadius: "8px",
                              fontSize: "12px",
                              fontWeight: "600",
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                              transition:
                                "transform 0.15s ease, background-color 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform =
                                "translateY(-2px)";
                              e.currentTarget.style.backgroundColor = "#8B5E3C";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.backgroundColor = "#6B4226";
                            }}
                          >
                            Start Quiz →
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .category-row:hover {
          background-color: rgba(107,66,38,0.04) !important;
        }
      `}</style>
    </div>
  );
}

function LoadingScreen() {
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
      Loading categories...
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <CategoriesContent />
    </Suspense>
  );
}
