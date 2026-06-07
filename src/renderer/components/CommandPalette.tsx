/**
 * CommandPalette.tsx
 * Full-screen command palette overlay with search, filters, sort, and keyboard navigation.
 * Opens with Cmd/Ctrl+K or / key.
 */

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  Search,
  Star,
  Tag,
  Loader2
} from "lucide-react";
import { apiV2 } from "../api";
import { useI18n } from "../i18n";
import {
  PRIMARY_CATEGORIES,
  TREND_WINDOWS,
  type SearchResult,
  type SearchFilters,
  type SortOption,
  type TrendWindow
} from "../../shared/types";

const SORT_OPTIONS: SortOption[] = ["relevance", "score", "stars", "growth", "recent"];

const LANGUAGES = [
  "TypeScript", "JavaScript", "Python", "Go", "Rust", "Java",
  "C", "C++", "C#", "Swift", "Kotlin", "Ruby", "PHP", "Shell"
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (repoId: string) => void;
}

export default function CommandPalette({ open, onClose, onSelect }: CommandPaletteProps) {
  const { t, categoryLabel } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Filters
  const [windowType, setWindowType] = useState<TrendWindow | "">("");
  const [primaryCategory, setPrimaryCategory] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  const [minStars, setMinStars] = useState<string>("");
  const [isFavorited, setIsFavorited] = useState(false);

  // Sort
  const [sort, setSort] = useState<SortOption>("relevance");

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Build filters object
  const filters = useMemo<SearchFilters>(() => ({
    windowType: windowType || undefined,
    primaryCategory: primaryCategory || undefined,
    language: language || undefined,
    minStars: minStars ? parseInt(minStars, 10) : undefined,
    isFavorited: isFavorited || undefined
  }), [windowType, primaryCategory, language, minStars, isFavorited]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() && !filters.primaryCategory && !filters.language && !filters.minStars && !filters.isFavorited) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiV2.search(searchQuery, filters, sort);
      setResults(data);
      setActiveIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters, sort]);

  // Debounce query changes
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, performSearch]);

  // Re-search when filters or sort change
  useEffect(() => {
    if (!open) return;
    performSearch(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowType, primaryCategory, language, minStars, isFavorited, sort, open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIndex]) {
        onSelect(results[activeIndex].repoId);
        onClose();
      }
      return;
    }
  }, [results, activeIndex, onClose, onSelect]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const sortLabels: Record<SortOption, string> = {
    relevance: t("search.sortRelevance"),
    score: t("search.sortScore"),
    stars: t("search.sortStars"),
    growth: t("search.sortGrowth"),
    recent: t("search.sortRecent")
  };

  return createPortal(
    <div className="command-palette-backdrop" onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        {/* Search input */}
        <div className="command-palette-search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.commandPlaceholder")}
          />
          {loading && <Loader2 size={16} className="spin" />}
        </div>

        {/* Filters row */}
        <div className="command-palette-filters">
          <select
            value={windowType}
            onChange={(e) => setWindowType(e.target.value as TrendWindow | "")}
            aria-label={t("search.filterWindow")}
          >
            <option value="">{t("search.filterWindow")}</option>
            {TREND_WINDOWS.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>

          <select
            value={primaryCategory}
            onChange={(e) => setPrimaryCategory(e.target.value)}
            aria-label={t("search.filterCategory")}
          >
            <option value="">{t("search.filterCategory")}</option>
            {PRIMARY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{categoryLabel(cat)}</option>
            ))}
          </select>

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label={t("search.filterLanguage")}
          >
            <option value="">{t("search.filterLanguage")}</option>
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>

          <input
            type="number"
            placeholder={t("search.filterMinStars")}
            value={minStars}
            onChange={(e) => setMinStars(e.target.value)}
            style={{ width: 90 }}
            aria-label={t("search.filterMinStars")}
          />

          <label>
            <input
              type="checkbox"
              checked={isFavorited}
              onChange={(e) => setIsFavorited(e.target.checked)}
            />
            {t("search.filterFavorited")}
          </label>
        </div>

        {/* Sort row */}
        <div className="command-palette-sort">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option}
              className={clsx(sort === option && "active")}
              onClick={() => setSort(option)}
              type="button"
            >
              {sortLabels[option]}
            </button>
          ))}
        </div>

        {/* Results list */}
        <div className="command-palette-results" ref={listRef}>
          {!loading && results.length === 0 && query.trim() && (
            <div className="empty-state" style={{ padding: "24px 16px" }}>
              <Search size={24} />
              <p>{t("search.empty")}</p>
            </div>
          )}
          {results.map((item, index) => (
            <div
              key={item.repoId}
              className={clsx("command-palette-item", index === activeIndex && "active")}
              data-index={index}
              onClick={() => {
                onSelect(item.repoId);
                onClose();
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <div className="command-palette-item-info">
                <div className="command-palette-item-name">
                  <HighlightSnippet snippet={item.highlights?.fullName} fallback={item.fullName} />
                </div>
                {item.description && (
                  <div className="command-palette-item-desc">
                    <HighlightSnippet snippet={item.highlights?.description} fallback={item.description} />
                  </div>
                )}
              </div>
              <div className="command-palette-item-meta">
                <span className="command-palette-item-stars">
                  <Star size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                  {item.stars.toLocaleString()}
                </span>
                {item.language && (
                  <span className="language-badge" style={{ fontSize: 10, padding: "1px 5px" }}>
                    {item.language}
                  </span>
                )}
                <span className="tag-pill" style={{ fontSize: 10, padding: "1px 5px" }}>
                  <Tag size={9} />
                  {categoryLabel(item.primaryCategory)}
                </span>
                {item.isCollected && (
                  <Star size={12} style={{ color: "var(--accent)", fill: "var(--accent)" }} />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="command-palette-footer">
          <span>
            {results.length > 0
              ? t("search.resultCount", { count: results.length })
              : query.trim() && !loading
                ? t("search.empty")
                : t("search.commandPlaceholder")
            }
          </span>
          <span>
            <kbd className="kbd-hint" style={{ marginRight: 4 }}>↑↓</kbd>
            navigate
            <kbd className="kbd-hint" style={{ margin: "0 4px" }}>↵</kbd>
            select
            <kbd className="kbd-hint" style={{ margin: "0 4px" }}>esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Render FTS snippets safely without injecting HTML.
 */
function HighlightSnippet({ snippet, fallback }: { snippet?: string; fallback: string }) {
  const source = snippet || fallback;
  const parts = source.split(/(<mark>|<\/mark>)/g).filter(Boolean);
  let marked = false;
  return (
    <>
      {parts.map((part, index) => {
        if (part === "<mark>") {
          marked = true;
          return null;
        }
        if (part === "</mark>") {
          marked = false;
          return null;
        }
        return marked ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>;
      })}
    </>
  );
}
