import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';

export type PageLoadStatus = 'idle' | 'loading' | 'background' | 'updated' | 'error';

export interface PageLoadState {
  pageId: string;
  titleKey: string;
  status: PageLoadStatus;
  progress: number;
  lastUpdatedAt: string | null;
  errorMessage: string;
}

export interface GlobalLoadState {
  pageId: string;
  titleKey: string;
  status: PageLoadStatus;
  progress: number;
  lastUpdatedAt: string | null;
  visible: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PageLoadStateService {
  private readonly statesSubject = new BehaviorSubject<Record<string, PageLoadState>>({});
  private readonly activePageIdSubject = new BehaviorSubject<string>('');

  readonly globalState$: Observable<GlobalLoadState> = combineLatest([
    this.statesSubject,
    this.activePageIdSubject,
  ]).pipe(
    map(([states, activePageId]) => {
      const current =
        (activePageId && states[activePageId]) ||
        Object.values(states).find((item) => item.status === 'loading' || item.status === 'background') ||
        Object.values(states).find((item) => item.lastUpdatedAt) ||
        null;

      return {
        pageId: current?.pageId || '',
        titleKey: current?.titleKey || '',
        status: current?.status || 'idle',
        progress: current?.progress ?? 0,
        lastUpdatedAt: current?.lastUpdatedAt || null,
        visible: !!current,
      };
    })
  );

  registerPage(pageId: string, titleKey: string): void {
    this.updateState(pageId, (current) => ({
      pageId,
      titleKey,
      status: current?.status || 'idle',
      progress: current?.progress ?? 0,
      lastUpdatedAt: current?.lastUpdatedAt || null,
      errorMessage: current?.errorMessage || '',
    }));
  }

  setActivePage(pageId: string): void {
    this.activePageIdSubject.next(pageId);
  }

  start(pageId: string, titleKey?: string): void {
    this.updateState(pageId, (current) => ({
      pageId,
      titleKey: titleKey || current?.titleKey || '',
      status: 'loading',
      progress: current?.progress && current.progress > 5 ? current.progress : 10,
      lastUpdatedAt: current?.lastUpdatedAt || null,
      errorMessage: '',
    }));
  }

  startBackground(pageId: string, titleKey?: string): void {
    this.updateState(pageId, (current) => ({
      pageId,
      titleKey: titleKey || current?.titleKey || '',
      status: 'background',
      progress: current?.progress && current.progress > 5 ? current.progress : 15,
      lastUpdatedAt: current?.lastUpdatedAt || null,
      errorMessage: '',
    }));
  }

  setProgress(pageId: string, progress: number): void {
    this.updateState(pageId, (current) => ({
      pageId,
      titleKey: current?.titleKey || '',
      status: current?.status || 'loading',
      progress: this.normalizeProgress(progress),
      lastUpdatedAt: current?.lastUpdatedAt || null,
      errorMessage: current?.errorMessage || '',
    }));
  }

  finish(pageId: string): void {
    this.updateState(pageId, (current) => ({
      pageId,
      titleKey: current?.titleKey || '',
      status: 'updated',
      progress: 100,
      lastUpdatedAt: this.buildTimestamp(),
      errorMessage: '',
    }));
  }

  fail(pageId: string, errorMessage = ''): void {
    this.updateState(pageId, (current) => ({
      pageId,
      titleKey: current?.titleKey || '',
      status: 'error',
      progress: Math.min(current?.progress ?? 0, 100),
      lastUpdatedAt: current?.lastUpdatedAt || null,
      errorMessage,
    }));
  }

  getPageState$(pageId: string): Observable<PageLoadState> {
    return this.statesSubject.pipe(
      map((states) => states[pageId] || this.buildDefaultState(pageId))
    );
  }

  isLoading(pageId: string): boolean {
    const state = this.statesSubject.value[pageId];
    return state?.status === 'loading' || state?.status === 'background';
  }

  isFresh(pageId: string, maxAgeMs = 10000): boolean {
    const state = this.statesSubject.value[pageId];
    if (!state?.lastUpdatedAt) {
      return false;
    }
    const updatedAt = new Date(state.lastUpdatedAt).getTime();
    if (!Number.isFinite(updatedAt)) {
      return false;
    }
    return Date.now() - updatedAt <= maxAgeMs;
  }

  private updateState(
    pageId: string,
    updater: (current: PageLoadState | undefined) => PageLoadState
  ): void {
    const snapshot = this.statesSubject.value;
    const nextState = updater(snapshot[pageId]);
    this.statesSubject.next({
      ...snapshot,
      [pageId]: nextState,
    });
  }

  private buildDefaultState(pageId: string): PageLoadState {
    return {
      pageId,
      titleKey: '',
      status: 'idle',
      progress: 0,
      lastUpdatedAt: null,
      errorMessage: '',
    };
  }

  private buildTimestamp(): string {
    return new Date().toISOString();
  }

  private normalizeProgress(progress: number): number {
    if (!Number.isFinite(progress)) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.round(progress)));
  }
}
