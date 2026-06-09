import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import {
  ThumbsRow, GeneralRow, FilterState, DEFAULT_FILTERS,
  THUMBS_ROWS, GENERAL_ROWS, PRODUCTS, QBANK_LIST, parseTs,
} from '../uask-data';

const PAGE_SIZE = 15;

/** Unified row shape for the ALL tab — avoids complex union typing in template. */
interface AllRow {
  id: string;
  kind: 'thumbs' | 'general';
  ts: string;
  tsMs: number;
  product: string;
  qbank: string | null;
  student: string;
  thumbsRating: 'up' | 'down' | null;
  generalRating: number | null;
  contentType: string;
  contentId: string | null;
  previewText: string;
  response: string | null;
  linked: null | { contentType: string; contentId: string|null; request: string; response: string; };
}

@Component({
  selector: 'app-feedback-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatSelectModule, MatInputModule,
    MatDatepickerModule, MatNativeDateModule,
    MatIconModule, MatButtonModule,
  ],
  templateUrl: './feedback-dashboard.component.html',
  styleUrl: './feedback-dashboard.component.scss',
})
export class FeedbackDashboardComponent {
  readonly PAGE_SIZE = PAGE_SIZE;
  readonly PRODUCTS_LIST = PRODUCTS.filter(p => p !== 'All Products');
  readonly QBANK_LIST = QBANK_LIST;
  readonly navItems = ['Change Product', 'Medical', 'DBank', 'iBank', 'Queues', 'Reports', 'Admin', 'More'];
  readonly contentTypeOptions = [
    { value: 'Question',  label: 'Questions' },
    { value: 'Lecture',   label: 'Lectures' },
    { value: 'Article',   label: 'Articles' },
    { value: 'Flashcard', label: 'Flashcards' },
    { value: 'none',      label: 'No Content Type' },
  ];
  readonly datePresets = [
    { k: 'today' as const, l: 'Today' },
    { k: '3d'    as const, l: 'Last 3 days' },
    { k: '7d'    as const, l: 'Last 7 days' },
    { k: '30d'   as const, l: 'Last 30 days' },
  ];

  // ── State signals ──────────────────────────────────────────────────
  filters     = signal<FilterState>({ ...DEFAULT_FILTERS });
  activeTab   = signal<'all' | 'thumbs' | 'general'>('all');
  allPage     = signal(1);
  thumbsPage  = signal(1);
  generalPage = signal(1);

  // Date picker committed display values
  dateStartObj = signal<Date | null>(new Date('04/19/2026'));
  dateEndObj   = signal<Date | null>(new Date('05/19/2026'));
  // Temp values inside open panel (committed only on Ok)
  datePickerOpen = signal(false);
  tempStartObj   = signal<Date | null>(new Date('04/19/2026'));
  tempEndObj     = signal<Date | null>(new Date('05/19/2026'));

  dateRangeLabel = computed(() => {
    const s = this.dateStartObj(), e = this.dateEndObj();
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    if (s && e) return `${fmt(s)} – ${fmt(e)}`;
    if (s) return fmt(s);
    return '';
  });

  // Row expand/collapse sets
  expandedReqs      = signal(new Set<string>());
  expandedResps     = signal(new Set<string>());
  expandedFeedbacks = signal(new Set<string>());
  openLinked        = signal(new Set<string>());

  // ── Rating range options ───────────────────────────────────────────
  readonly RATING_RANGES = [
    { value: 'any',     label: 'Any Rating' },
    { value: '0.0-0.9', label: '0.0 - 0.9' },
    { value: '1.0-1.9', label: '1.0 - 1.9' },
    { value: '2.0-2.9', label: '2.0 - 2.9' },
    { value: '3.0-3.9', label: '3.0 - 3.9' },
    { value: '4.0-5.0', label: '4.0 - 5.0' },
  ];

  // ── Conditional filter visibility ──────────────────────────────────
  showRatingFilter = computed(() => {
    const ft = this.filters().feedbackType;
    return ft === 'general' || ft === 'general-with-prompt' || ft === 'general-without-prompt';
  });
  showThumbsDirectionFilter = computed(() => this.filters().feedbackType === 'thumbs');

  // ── Derived rows ───────────────────────────────────────────────────
  thumbsRows = computed(() => {
    const f = this.filters();
    return THUMBS_ROWS.filter(r => this._match(r, 'thumbs', f));
  });

  generalRows = computed(() => {
    const f = this.filters();
    return GENERAL_ROWS.filter(r => this._match(r, 'general', f));
  });

  allRows = computed((): AllRow[] => {
    const f = this.filters();
    const thumbs: AllRow[] = THUMBS_ROWS
      .filter(r => this._match(r, 'thumbs', f))
      .map(r => ({
        id: r.id, kind: 'thumbs', ts: r.ts, tsMs: parseTs(r.ts),
        product: r.product, qbank: r.qbank, student: r.student,
        thumbsRating: r.rating, generalRating: null,
        contentType: r.contentType, contentId: r.contentId,
        previewText: r.response, response: r.response, linked: null,
      }));
    const general: AllRow[] = GENERAL_ROWS
      .filter(r => this._match(r, 'general', f))
      .map(r => ({
        id: r.id, kind: 'general', ts: r.ts, tsMs: parseTs(r.ts),
        product: r.product, qbank: r.qbank, student: r.student,
        thumbsRating: null, generalRating: r.rating,
        contentType: r.linked?.contentType ?? '—',
        contentId: r.linked?.contentId ?? null,
        previewText: r.linked?.request ?? r.feedback,
        response: null, linked: r.linked,
      }));
    return [...thumbs, ...general].sort((a, b) => b.tsMs - a.tsMs);
  });

  allSlice = computed(() => {
    const p = this.allPage(), rows = this.allRows();
    return rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  });
  thumbsSlice = computed(() => {
    const p = this.thumbsPage(), rows = this.thumbsRows();
    return rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  });
  generalSlice = computed(() => {
    const p = this.generalPage(), rows = this.generalRows();
    return rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  });

  allTotalPages     = computed(() => Math.max(1, Math.ceil(this.allRows().length / PAGE_SIZE)));
  thumbsTotalPages  = computed(() => Math.max(1, Math.ceil(this.thumbsRows().length / PAGE_SIZE)));
  generalTotalPages = computed(() => Math.max(1, Math.ceil(this.generalRows().length / PAGE_SIZE)));

  activeCount = computed(() => {
    const tab = this.activeTab();
    if (tab === 'all')     return this.allRows().length;
    if (tab === 'thumbs')  return this.thumbsRows().length;
    return this.generalRows().length;
  });

  // ── KPI stats — feedbackType/rating/thumbsDirection excluded so counts stay complete ─
  stats = computed(() => {
    const f = this.filters();
    const t = THUMBS_ROWS.filter(r => this._statsMatch(r, 'thumbs', f));
    const g = GENERAL_ROWS.filter(r => this._statsMatch(r, 'general', f));
    const up = t.filter(r => r.rating === 'up').length;
    return { total: t.length + g.length, up, down: t.length - up, general: g.length };
  });

  activeChips = computed(() => {
    const f = this.filters();
    const chips: Array<{ k: string; l: string }> = [];
    const ftLabels: Record<string, string> = {
      'thumbs': 'Thumbs Only', 'general': 'General Only',
      'general-with-prompt': 'General Feedback With Prompt', 'general-without-prompt': 'General Feedback Without Prompt',
    };
    if (f.feedbackType !== 'all') chips.push({ k: 'feedbackType', l: ftLabels[f.feedbackType] });
    if (f.feedbackType === 'thumbs' && f.thumbsDirection !== 'all')
      chips.push({ k: 'thumbsDirection', l: f.thumbsDirection === 'up' ? 'Thumbs Up' : 'Thumbs Down' });
    if (f.ratingRange !== 'any') chips.push({ k: 'rating', l: `Rating: ${f.ratingRange.replace('-', ' - ')}` });
    for (const ct of f.contentType)
      chips.push({ k: `ct-${ct}`, l: ct === 'none' ? 'No Content' : ct });
    if (f.student)    chips.push({ k: 'student',    l: `Search: ${f.student}` });
    return chips;
  });

  // ── Actions ────────────────────────────────────────────────────────
  setProducts(products: string[]): void {
    this.filters.update(f => ({ ...f, product: products })); this._resetPages();
  }

  setQbank(qbanks: string[]): void {
    this.filters.update(f => ({ ...f, qbank: qbanks })); this._resetPages();
  }

  setFeedbackType(v: string): void {
    // Reset dependent filters when changing type
    this.filters.update(f => ({
      ...f,
      feedbackType: v as FilterState['feedbackType'],
      thumbsDirection: 'all',
      ratingRange: 'any',
    }));
    this._resetPages();
  }

  setThumbsDirection(v: string): void {
    this.filters.update(f => ({ ...f, thumbsDirection: v as FilterState['thumbsDirection'] }));
    this._resetPages();
  }

  setRatingRange(v: string): void {
    this.filters.update(f => ({ ...f, ratingRange: v })); this._resetPages();
  }

  setContentType(types: string[]): void {
    this.filters.update(f => ({ ...f, contentType: types })); this._resetPages();
  }

  setStudentFilter(v: string): void {
    this.filters.update(f => ({ ...f, student: v })); this._resetPages();
  }

  /** Toggle: clicking the same user again clears the filter. */
  setUserFilter(id: string): void {
    this.filters.update(f => ({ ...f, userFilter: f.userFilter === id ? '' : id }));
    this._resetPages();
  }

  clearUserFilter(): void {
    this.filters.update(f => ({ ...f, userFilter: '' })); this._resetPages();
  }

  removeChip(key: string): void {
    if (key.startsWith('ct-')) {
      const ct = key.replace('ct-', '');
      this.filters.update(f => ({ ...f, contentType: f.contentType.filter(c => c !== ct) }));
    } else {
      this.filters.update(f => ({
        ...f,
        feedbackType:   key === 'feedbackType'   ? 'all'  : f.feedbackType,
        thumbsDirection:key === 'thumbsDirection' ? 'all'  : f.thumbsDirection,
        ratingRange:    key === 'rating'          ? 'any'  : f.ratingRange,
        student:        key === 'student'         ? ''     : f.student,
      }));
    }
    this._resetPages();
  }

  resetAllFilters(): void {
    this.filters.set({ ...DEFAULT_FILTERS });
    this.dateStartObj.set(new Date('04/19/2026'));
    this.dateEndObj.set(new Date('05/19/2026'));
    this.tempStartObj.set(new Date('04/19/2026'));
    this.tempEndObj.set(new Date('05/19/2026'));
    this._resetPages();
  }

  setActiveTab(tab: 'all' | 'thumbs' | 'general'): void {
    this.activeTab.set(tab); this._resetPages();
  }

  setAllPage(n: number): void     { this.allPage.set(n); }
  setThumbsPage(n: number): void  { this.thumbsPage.set(n); }
  setGeneralPage(n: number): void { this.generalPage.set(n); }

  // ── Date picker panel ──────────────────────────────────────────────
  toggleDatePicker(): void {
    if (!this.datePickerOpen()) {
      this.tempStartObj.set(this.dateStartObj());
      this.tempEndObj.set(this.dateEndObj());
    }
    this.datePickerOpen.update(v => !v);
  }

  closeDatePicker(): void { this.datePickerOpen.set(false); }

  onTempStartChange(d: Date | null): void {
    this.tempStartObj.set(d);
    this.filters.update(f => ({ ...f, preset: null }));
  }

  onTempEndChange(d: Date | null): void {
    this.tempEndObj.set(d);
    this.filters.update(f => ({ ...f, preset: null }));
  }

  setPresetInPanel(k: 'today' | '3d' | '7d' | '30d'): void {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(); end.setHours(23, 59, 59, 999);
    if (k === '3d')  start.setDate(start.getDate() - 3);
    if (k === '7d')  start.setDate(start.getDate() - 7);
    if (k === '30d') start.setDate(start.getDate() - 30);
    this.tempStartObj.set(start);
    this.tempEndObj.set(end);
    this.filters.update(f => ({ ...f, preset: k }));
  }

  applyDatePicker(): void {
    const s = this.tempStartObj(), e = this.tempEndObj();
    this.dateStartObj.set(s);
    this.dateEndObj.set(e);
    if (s) this.filters.update(f => ({ ...f, dateStart: s.toLocaleDateString('en-US') }));
    if (e) this.filters.update(f => ({ ...f, dateEnd:   e.toLocaleDateString('en-US') }));
    this._resetPages();
    this.datePickerOpen.set(false);
  }

  clearDatePicker(): void {
    this.tempStartObj.set(null); this.tempEndObj.set(null);
    this.dateStartObj.set(null); this.dateEndObj.set(null);
    this.filters.update(f => ({ ...f, dateStart: '', dateEnd: '', preset: null }));
    this._resetPages();
    this.datePickerOpen.set(false);
  }

  // ── Row expand/collapse ────────────────────────────────────────────
  isReqExpanded(id: string):      boolean { return this.expandedReqs().has(id); }
  isRespExpanded(id: string):     boolean { return this.expandedResps().has(id); }
  isFeedbackExpanded(id: string): boolean { return this.expandedFeedbacks().has(id); }
  isLinkedOpen(id: string):       boolean { return this.openLinked().has(id); }

  toggleReq(id: string):      void { this._toggle(this.expandedReqs,      id); }
  toggleResp(id: string):     void { this._toggle(this.expandedResps,     id); }
  toggleFeedback(id: string): void { this._toggle(this.expandedFeedbacks, id); }
  toggleLinked(id: string):   void { this._toggle(this.openLinked,        id); }

  // ── Helpers ────────────────────────────────────────────────────────
  truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max).trim() + '…' : text;
  }

  studentInitials(name: string): string { return name.slice(0, 2).toUpperCase(); }

  /** Strip alphabetic prefix and pad to 5 digits — "Q-9921" → "09921", "A-BIO-88" → "00088" */
  stripId(id: string | null): string | null {
    if (!id) return null;
    const parts = id.split('-');
    const num = parts[parts.length - 1];
    return num.padStart(5, '0');
  }

  starColor(rating: number | null): { bg: string; fg: string; border: string } {
    if (rating === null) return { bg: '#F0F1F2', fg: '#6B7280', border: '#D1D3D8' };
    if (rating >= 4)     return { bg: '#D2EBDD', fg: '#1D9050', border: '#BFE0CB' };
    if (rating >= 3)     return { bg: '#F3E4CC', fg: '#B27000', border: '#E8D0A6' };
    return { bg: '#F6D9D9', fg: '#C03E3E', border: '#EFC0C0' };
  }

  pageStart(page: number, total: number): number { return total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1; }
  pageEnd(page: number, total: number): number   { return Math.min(total, page * PAGE_SIZE); }

  // ── Private ────────────────────────────────────────────────────────
  private _resetPages(): void {
    this.allPage.set(1); this.thumbsPage.set(1); this.generalPage.set(1);
  }

  private _toggle(sig: ReturnType<typeof signal<Set<string>>>, id: string): void {
    sig.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  private _match(row: ThumbsRow | GeneralRow, kind: 'thumbs' | 'general', f: FilterState): boolean {
    // Inline user filter (exact match, from clicking student cell)
    if (f.userFilter && row.student !== f.userFilter) return false;

    // Product filter
    if (f.product.length > 0 && !f.product.includes(row.product)) return false;

    // QBank filter
    if (f.qbank.length > 0) {
      const qb = row.qbank;
      const wantsNone = f.qbank.includes('none');
      const others = f.qbank.filter(q => q !== 'none');
      if (!((wantsNone && !qb) || (!!qb && others.includes(qb)))) return false;
    }

    // Student text search (partial)
    if (f.student && !row.student.toLowerCase().includes(f.student.toLowerCase())) return false;

    // Feedback type filter
    if (f.feedbackType === 'thumbs' && kind !== 'thumbs') return false;
    if (f.feedbackType === 'general' && kind !== 'general') return false;
    if (f.feedbackType === 'general-with-prompt'
        && !(kind === 'general' && (row as GeneralRow).linked)) return false;
    if (f.feedbackType === 'general-without-prompt'
        && !(kind === 'general' && !(row as GeneralRow).linked)) return false;

    // Thumbs direction filter
    if (kind === 'thumbs' && f.feedbackType === 'thumbs' && f.thumbsDirection !== 'all') {
      if ((row as ThumbsRow).rating !== f.thumbsDirection) return false;
    }

    // Rating range filter (general only)
    // null-rating rows (No Rating) are treated as belonging to the 0.0–0.9 bucket
    if (kind === 'general' && f.ratingRange !== 'any') {
      const r = (row as GeneralRow).rating;
      const [minStr, maxStr] = f.ratingRange.split('-');
      const min = parseFloat(minStr), max = parseFloat(maxStr);
      if (r === null) {
        // "No Rating" rows only match the 0.0–0.9 range (min === 0)
        if (min !== 0) return false;
      } else {
        if (r < min || r > max) return false;
      }
    }

    // Content type filter (multi-select)
    if (f.contentType.length > 0) {
      const ct = kind === 'thumbs'
        ? (row as ThumbsRow).contentType
        : ((row as GeneralRow).linked?.contentType ?? '—');
      const wantsNone = f.contentType.includes('none');
      const others = f.contentType.filter(c => c !== 'none');
      if (!((wantsNone && ct === '—') || others.includes(ct))) return false;
    }

    return true;
  }

  /** Stats match — ignores feedbackType / thumbsDirection / rating so KPI counts stay complete. */
  private _statsMatch(row: ThumbsRow | GeneralRow, kind: 'thumbs' | 'general', f: FilterState): boolean {
    if (f.userFilter && row.student !== f.userFilter) return false;
    if (f.product.length > 0 && !f.product.includes(row.product)) return false;
    if (f.qbank.length > 0) {
      const qb = row.qbank;
      const wantsNone = f.qbank.includes('none');
      const others = f.qbank.filter(q => q !== 'none');
      if (!((wantsNone && !qb) || (!!qb && others.includes(qb)))) return false;
    }
    if (f.student && !row.student.toLowerCase().includes(f.student.toLowerCase())) return false;
    if (f.contentType.length > 0) {
      const ct = kind === 'thumbs'
        ? (row as ThumbsRow).contentType
        : ((row as GeneralRow).linked?.contentType ?? '—');
      const wantsNone = f.contentType.includes('none');
      const others = f.contentType.filter(c => c !== 'none');
      if (!((wantsNone && ct === '—') || others.includes(ct))) return false;
    }
    return true;
  }
}
